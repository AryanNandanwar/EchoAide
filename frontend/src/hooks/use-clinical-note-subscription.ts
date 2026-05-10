import { useEffect, useCallback, useRef } from 'react';
import { supabaseService } from '../services/supabase-service';

export interface UseClinicalNoteSubscriptionProps {
  noteId?: string;
  onNoteGenerated?: (note: any) => void;
  onError?: (error: Error) => void;
}

export function useClinicalNoteSubscription({
  noteId,
  onNoteGenerated,
  onError,
}: UseClinicalNoteSubscriptionProps) {
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const noteReceivedRef = useRef(false);
  const previousNoteIdRef = useRef<string | null>(null);

  const subscribe = useCallback(() => {
    if (!noteId) {
      console.warn('Cannot subscribe: noteId is required');
      return;
    }

    // Clean up any existing subscription
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    unsubscribeRef.current = supabaseService.subscribeToClinicalNote({
      noteId,
      onNoteGenerated: (note) => {
        console.log(`📋 Clinical note generated/updated: ${note.id}`);
        // Mark note as received
        noteReceivedRef.current = true;
        console.log(`📋 Note ${note.id} marked as received via subscription, preventing future fetches`);
        // Clear timeout when note is received
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        onNoteGenerated?.(note);
        // Reset retry count on successful fetch
        retryCountRef.current = 0;
      },
      onError: (error) => {
        console.error(`❌ Error in clinical note subscription: ${error.message}`);
        
        // Retry logic for failed subscriptions
        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          console.log(`🔄 Retrying subscription (${retryCountRef.current}/${maxRetries})...`);
          setTimeout(() => subscribe(), 2000 * retryCountRef.current); // Exponential backoff
        } else {
          onError?.(error);
        }
      },
    });
  }, [noteId, onNoteGenerated, onError]);

  const unsubscribe = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const fetchNote = useCallback(async (id: string) => {
    // Don't fetch if note has already been received
    if (noteReceivedRef.current) {
      console.log(`📋 Note ${id} already received, skipping fetch`);
      return null;
    }

    try {
      // Add a 5 second delay to allow for database commit
      await new Promise(resolve => setTimeout(resolve, 7000));
      const note = await supabaseService.fetchClinicalNote(id);
      
      // Mark note as received if successfully fetched
      if (note) {
        noteReceivedRef.current = true;
        console.log(`📋 Note ${id} marked as received, preventing future fetches`);

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
      
      return note;
    } catch (error) {
      console.error(`❌ Error fetching clinical note: ${error}`);
      
      // Don't throw error immediately - let subscription handle it
      // This allows continuous listening without breaking the UI
      console.log(`⏳ Will continue listening for note ${id} via subscription...`);
      
      // Only throw error if it's not a network error
      if (error && typeof error === 'object' && 'message' in error && (error as any).message && (error as any).message.includes('Failed to fetch')) {
        throw error;
      }
      
      return null; // Return null instead of throwing
    }
  }, [supabaseService]);

  useEffect(() => {
    if (noteId) {
      // Only reset note received flag when noteId actually changes
      if (previousNoteIdRef.current !== noteId) {
        noteReceivedRef.current = false;
        console.log(`🔄 Reset note received flag for new noteId: ${noteId}`);
        previousNoteIdRef.current = noteId;
      }
      
      // Start subscription first
      subscribe();
      
      // Also trigger initial fetch only if note hasn't been received yet
      if (!noteReceivedRef.current) {
        fetchNote(noteId).then(note => {
          if (note) {
            console.log(`📋 Initial fetch successful for note ${noteId}`);
            // Note will be handled by the fetchNote function's success logic
          }
        }).catch(error => {
          console.error(`❌ Initial fetch failed for note ${noteId}:`, error);
        });
      }
      
      // Set 15-second timeout only if not already set and note hasn't been received
      if (!timeoutRef.current && !noteReceivedRef.current) {
        timeoutRef.current = setTimeout(() => {
          console.log(`⏰ Timeout: Note ${noteId} not found after 15 seconds`);
          unsubscribe(); // Stop listening
          onError?.(new Error(`Note ${noteId} not found`));
        }, 15000);
      }
    }

    return () => {
      unsubscribe(); // This will clear both subscription and timeout
    };
  }, [noteId, subscribe, unsubscribe, fetchNote]);

  return {
    subscribe,
    unsubscribe,
    fetchNote,
  };
}
