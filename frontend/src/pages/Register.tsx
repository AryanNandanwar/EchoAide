// src/components/Register.tsx
import React from 'react';
import {
  TextField,
  Button,
  IconButton,
  InputAdornment,
  MenuItem,
  Box,
  Alert,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useForm, Controller  } from 'react-hook-form';
import type { SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import api from '../lib/api'; 
import { FormControl, InputLabel, OutlinedInput, FormHelperText } from '@mui/material';
import { useNavigate } from "react-router-dom";

type FormValues = {
  fullName: string;
  email: string;
  password: string;
  contact: string;
  specialization: string;
};

type Props = {
  onSuccess?: (user: any) => void;
};

// Zod schema must match FormValues keys
const schema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  email: z.email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  contact: z
    .string()
    .min(6, 'Contact is required')
    .regex(/^\+?[0-9\-\s]{6,20}$/, 'Invalid phone number'),
  specialization: z.string().min(1, 'Specialization is required'),
});

export default function Register({ onSuccess }: Props) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      contact: '',
      specialization: '',
    },
  });

  const [showPassword, setShowPassword] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const navigate = useNavigate();

  const specializations = [
    'General Practitioner',
    'Cardiology',
    'Neurology',
    'Pediatrics',
    'Orthopedics',
    'Dermatology',
    'Psychiatry',
    'Radiology',
    'Gynecology',
    'Urology',
    'Anesthesiology',
    'Emergency Medicine',
    'Endocrinology',
    'Gastroenterology',
    'Hematology',
    'Infectious Disease',
    'Nephrology',
    'Ophthalmology',
    'Pathology',
    'Pulmonology',
    'Rheumatology',
    'Other',
  ];

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    setServerError(null);
    try {
      const resp = await api.post('/api/auth/signup', {
        fullName: data.fullName, // backend expects `name`
        email: data.email,
        password: data.password,
        contactNo: data.contact,
        specialization: data.specialization,
      });

      

      onSuccess?.(resp.data);
      navigate("/", { replace: true });
    } catch (err: any) {
      if (err?.response) {
        const { status, data } = err.response;
        // map common server responses to field errors
        if (status === 409 && typeof data?.message === 'string' && data.message.toLowerCase().includes('email')) {
          setError('email', { type: 'server', message: 'Email already exists' });
          return;
        }

        if (status === 400 && data?.message && typeof data.message === 'string') {
          setServerError(data.message);

        } else if (status >= 500) {
          setServerError('Server error — please try again later.');
        } else {
          setServerError(data?.message || 'Registration failed.');
        }
      } else {
        setServerError('Network error. Check backend & CORS.');
      }
    }
  };

  return (
    <div className="w-screen h-screen flex overflow-hidden bg-gray-50">
      <div className="flex flex-col justify-center items-center w-full md:w-1/3 lg:w-2/5 px-8 py-12 bg-white shadow-xl z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-gradient-to-br from-emerald-500 to-sky-600 text-white shadow-md">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2v6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 9h6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="17.5" cy="17.5" r="3" stroke="white" strokeWidth="1.6" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">DoctorScribe</h1>
            <p className="text-sm text-slate-500">Create your clinician account</p>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 mb-2">Register</h2>
        <p className="text-sm text-slate-500 mb-6">Enter your details to get started with secure clinical notes.</p>

        <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ width: '100%' }}>
          {/* Full name */}
          <Controller
            name="fullName"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="FullName"
                variant="outlined"
                size="small"
                fullWidth
                margin="normal"
                error={!!errors.fullName}
                helperText={errors.fullName?.message as string | undefined}
              />

            )}
          />

          {/* Email */}
          <Controller
            name="email"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Email"
                variant="outlined"
                size="small"
                fullWidth
                margin="normal"
                error={!!errors.email}
                helperText={errors.email?.message as string | undefined}
              />
            )}
          />

          {/* Password */}
          {/* Password */}
          <Controller
            name="password"
            control={control}
            render={({ field }) => (
              <FormControl variant="outlined" fullWidth margin="normal" error={!!errors.password}>
                <InputLabel htmlFor="password-input">Password</InputLabel>
                <OutlinedInput
                  id="password-input"
                  {...field}
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  endAdornment={
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((s) => !s)}
                        edge="end"
                        aria-label={showPassword ? 'hide password' : 'show password'}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  }
                />
                <FormHelperText>{errors.password?.message as string | undefined ?? 'At least 8 characters recommended'}</FormHelperText>
              </FormControl>
            )}
          />


          {/* Contact */}
          <Controller
            name="contact"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Contact number"
                variant="outlined"
                size="small"
                fullWidth
                margin="normal"
                placeholder="+91 98765 43210"
                error={!!errors.contact}
                helperText={errors.contact?.message as string | undefined}
              />
            )}
          />

          {/* Specialization */}
          <Controller
            name="specialization"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Specialization"
                select
                fullWidth
                size="small"
                margin="normal"
                error={!!errors.specialization}
                helperText={errors.specialization?.message as string | undefined}
              >
                {specializations.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          {serverError && (
            <Alert severity="error" sx={{ mt: 1, mb: 1 }}>
              {serverError}
            </Alert>
          )}
          

          <Button type="submit" variant="contained" fullWidth disabled={isSubmitting} sx={{ textTransform: 'none', background: 'linear-gradient(90deg,#06b6d4,#6366f1)', mt: 1 }}>
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </Button>

          <p className="text-center text-sm text-slate-500 mt-2">
            Already have an account? <a className="text-sky-600 hover:underline" href="/login">Login</a>
          </p>
        </Box>
      </div>

      <div className="hidden md:flex flex-1 bg-gradient-to-br from-sky-800 via-indigo-800 to-violet-700 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(45deg,_rgba(255,255,255,0.14)_0px,_rgba(255,255,255,0.14)_1px,_transparent_1px,_transparent_12px)]"></div>
        <div className="relative z-10 px-12 py-16 text-left text-white">
          <h3 className="text-3xl font-semibold mb-4">Welcome to DoctorScribe</h3>
          <p className="text-base text-slate-100 max-w-lg">
            Join other clinicians using DoctorScribe to securely capture patient encounters, manage notes, and access advanced transcription features.
          </p>

          <div className="mt-8">
            <svg viewBox="0 0 600 200" className="w-full h-44">
              <path d="M0 100 L40 100 L70 70 L110 140 L150 60 L200 140 L270 60 L350 100 L600 100" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
