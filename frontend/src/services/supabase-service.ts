import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';


export interface ClinicalNoteSubscription {
  noteId: string;
  onNoteGenerated: (note: any) => void;
  onError?: (error: Error) => void;
}

export class SupabaseService {
  private subscriptions: Map<string, RealtimeChannel> = new Map();
  private activeFetches: Map<string, Promise<any>> = new Map();
  private subscriptionStates: Map<string, 'SUBSCRIBING' | 'SUBSCRIBED' | 'ERROR'> = new Map();

  
  subscribeToClinicalNote(subscription: ClinicalNoteSubscription): () => void {
    const { noteId, onNoteGenerated, onError } = subscription;
    
    // Check if already subscribed or subscribing
    const existingState = this.subscriptionStates.get(noteId);
    if (existingState === 'SUBSCRIBING' || existingState === 'SUBSCRIBED') {
      console.log(`⚠️ Already ${existingState} to clinical note: ${noteId}, skipping redundant subscription`);
      return () => this.unsubscribeFromClinicalNote(noteId);
    }
    
    console.log(`🔔 Subscribing to clinical note: ${noteId}`);
    this.subscriptionStates.set(noteId, 'SUBSCRIBING');

    const channel = supabase
      .channel(`clinical_note_${noteId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'clinical_notes',
          filter: `id=eq.${noteId}`
        },
        (payload) => {
          console.log('📨 Clinical note INSERT event received:', payload);
          console.log('🔍 Payload details:', {
            hasNew: !!payload.new,
            newId: payload.new?.id,
            expectedId: noteId,
            matches: payload.new?.id === noteId
          });
          
          if (payload.new) {
            console.log('✅ Calling onNoteGenerated with:', payload.new);
            onNoteGenerated(payload.new);
          } else {
            console.log('⚠️ INSERT event received but no payload.new data');
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'clinical_notes',
          filter: `id=eq.${noteId}`
        },
        (payload) => {
          console.log('📝 Clinical note UPDATE event received:', payload);
          console.log('🔍 UPDATE payload details:', {
            hasNew: !!payload.new,
            newId: payload.new?.id,
            expectedId: noteId,
            matches: payload.new?.id === noteId,
            hasOld: !!payload.old
          });
          
          if (payload.new) {
            console.log('✅ Calling onNoteGenerated with updated note:', payload.new);
            onNoteGenerated(payload.new);
          } else {
            console.log('⚠️ UPDATE event received but no payload.new data');
          }
        }
      )
      .subscribe((status, err) => {
        console.log(`📡 Subscription status for ${noteId}:`, status);
        
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Successfully subscribed to clinical note: ${noteId}`);
          console.log(`🔔 Listening for INSERT/UPDATE events on clinical_notes table...`);
          this.subscriptionStates.set(noteId, 'SUBSCRIBED');
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`❌ Error subscribing to clinical note: ${noteId}`, err);
          console.log(`🚫 RLS might be blocking real-time subscription access`);
          this.subscriptionStates.set(noteId, 'ERROR');
          onError?.(new Error('Failed to subscribe to clinical note'));
        } else if (status === 'TIMED_OUT') {
          console.error(`⏰ Subscription timed out for clinical note: ${noteId}`);
          this.subscriptionStates.set(noteId, 'ERROR');
          onError?.(new Error('Subscription timed out'));
        } else if (status === 'CLOSED') {
          console.log(`🔕 Subscription closed for clinical note: ${noteId}`);
          this.subscriptionStates.delete(noteId);
        }
      });

    this.subscriptions.set(noteId, channel);

    // Return unsubscribe function
    return () => {
      this.unsubscribeFromClinicalNote(noteId);
    };
  }

  unsubscribeFromClinicalNote(noteId: string): void {
    const channel = this.subscriptions.get(noteId);
    if (channel) {
      console.log(`🔕 Unsubscribing from clinical note: ${noteId}`);
      supabase.removeChannel(channel);
      this.subscriptions.delete(noteId);
      this.subscriptionStates.delete(noteId);
    }
  }

  async fetchClinicalNote(noteId: string): Promise<any> {
    // Check if there's already an active fetch for this note ID
    if (this.activeFetches.has(noteId)) {
      console.log(`⚠️ Fetch already in progress for note ${noteId}, reusing existing promise`);
      return this.activeFetches.get(noteId);
    }

    // Create the fetch promise
    const fetchPromise = this._fetchClinicalNoteWithRetry(noteId);
    
    // Store the active fetch
    this.activeFetches.set(noteId, fetchPromise);
    
    try {
      const result = await fetchPromise;
      return result;
    } finally {
      // Clean up the active fetch regardless of success/failure
      this.activeFetches.delete(noteId);
    }
  }

  private async _fetchClinicalNoteWithRetry(noteId: string): Promise<any> {
    try {
      console.log(`🔍 Fetching clinical note ${noteId} using service role client...`);
    
      // Retry mechanism with exponential backoff
      const maxRetries = 5;
      const baseDelay = 1000; // 1 second

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`🔄 Attempt ${attempt}/${maxRetries} to fetch note ${noteId}`);
        
        const { data, error } = await supabase
          .from('clinical_notes')
          .select('*')
          .eq('id', noteId);

        if (error) {
          console.log(`🚫 error on attempt ${attempt}:`, error);
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
            console.log(`⏳ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw error;
        }

        if (data && data.length > 0) {
          console.log(`✅ Successfully fetched clinical note on attempt ${attempt}:`, data[0]);
          return data[0];
        }        

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s, 8s
          console.log(`⏳ Note not found on attempt ${attempt}, waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.log(`🚫 Max retries (${maxRetries}) reached, note still not found`);
        }
      }

      throw new Error(`No clinical note found with ID: ${noteId} after ${maxRetries} attempts. Service role client working but note not found.`);
    } catch (error) {
      console.error(`❌ Error fetching clinical note ${noteId}:`, error);
      throw error;
    }
  }

  // Cleanup all subscriptions and active fetches
  cleanup(): void {
    console.log('🧹 Cleaning up all Supabase subscriptions and active fetches');
    this.subscriptions.forEach((channel) => {
      supabase.removeChannel(channel);
    });
    this.subscriptions.clear();
    
    // Clear active fetches
    this.activeFetches.clear();
    
    // Clear subscription states
    this.subscriptionStates.clear();
    
    console.log('🧹 Cleared active fetches and subscription states');
  }
}

export const supabaseService = new SupabaseService();
