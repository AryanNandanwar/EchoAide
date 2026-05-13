// src/components/Login.tsx
import React, { useState } from "react";
import {
  TextField,
  Button,
  IconButton,
  InputAdornment,
  Checkbox,
  FormControlLabel,
  Box,
  Alert,
  Tab,
  Tabs,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import api from "../lib/api"; 
import { useNavigate } from "react-router-dom";

// EchoAide Fullscreen Login Page (React + TypeScript + Tailwind + MUI)
// Updated to call backend, show server errors & support "remember me".

type Props = {
  onSubmit?: (respData: any) => void; // receives backend response (token/user) if provided
};

type AccountType = "doctor" | "receptionist";

export default function Login({ onSubmit }: Props) {
  const [accountType, setAccountType] = useState<AccountType>("doctor");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      // call your backend login endpoint - change path if your API differs
      const resp = await api.post("/api/auth/login", {
        email,
        password,
        accountType,
      });

      // expected: resp.data contains token and user info (adjust as your backend returns)
      const data = resp.data;
      const user = data?.user ? { ...data.user, role: accountType } : undefined;

      console.log("Login successful:", data.accessToken, user);

      // if "remember" store token; otherwise store in sessionStorage
      if (data?.accessToken) {
        if (remember) {
          localStorage.setItem("ds_token", data.accessToken);
        } else {
          sessionStorage.setItem("ds_token", data.accessToken);
        }
      }

      // optionally store user object (non-sensitive)
      if (user) {
        const userJson = JSON.stringify(user);
        if (remember) {
          localStorage.setItem("ds_user", userJson);
        } else {
          sessionStorage.setItem("ds_user", userJson);
        }
      }

      // call parent handler if provided
      onSubmit?.({ ...data, user });
      if (accountType === "receptionist") {
        navigate("/receptionist/intake", { replace: true });
      } else {
        navigate("/", { replace: true });
      }

    } catch (err: any) {
      // axios-style error handling
      if (err?.response) {
        const { status, data } = err.response;
        if (status === 401) {
          setError(`Invalid ${accountType} email or password.`);
        } else if (status === 400 && data?.message) {
          setError(data.message);
        } else if (status >= 500) {
          setError("Server error — please try again later.");
        } else {
          setError(data?.message || "Failed to sign in.");
        }
      } else {
        setError("Network error. Check backend & CORS.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-screen h-screen flex overflow-hidden bg-gray-50">
      {/* Left section - Login form */}
      <div className="flex flex-col justify-center items-center w-full md:w-1/3 lg:w-2/5 px-8 py-12 bg-white shadow-xl z-10">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-gradient-to-br from-sky-600 to-emerald-500 text-white shadow-md">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2v6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 9h6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="17.5" cy="17.5" r="3" stroke="white" strokeWidth="1.6" />
              <path d="M19.5 19.5L21 21" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">EchoAide</h1>
            <p className="text-sm text-slate-500">Secure medical notes & transcription</p>
          </div>
        </div>

        {/* Form */}
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Welcome back!</h2>
        <p className="text-sm text-slate-500 mb-6">
          Log in as a doctor or receptionist to continue.
        </p>

        <Box component="form" onSubmit={handleSubmit} className="w-full space-y-4">
          <Tabs
            value={accountType}
            onChange={(_, value: AccountType) => {
              setAccountType(value);
              setError(null);
            }}
            variant="fullWidth"
            aria-label="Login account type"
            sx={{
              minHeight: 40,
              "& .MuiTab-root": {
                minHeight: 40,
                textTransform: "none",
                fontWeight: 600,
              },
            }}
          >
            <Tab label="Doctor" value="doctor" />
            <Tab label="Receptionist" value="receptionist" />
          </Tabs>

          <TextField
            label="Email"
            variant="outlined"
            size="small"
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />

          <TextField
            label="Password"
            variant="outlined"
            size="small"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showPassword ? "text" : "password"}
            required
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowPassword((s) => !s)} edge="end" aria-label={showPassword ? "hide password" : "show password"}>
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <div className="flex items-center justify-between">
            <FormControlLabel
              control={<Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} />}
              label={<span className="text-sm text-slate-600">Remember me</span>}
            />
            <a href="/forgot-password" className="text-sm text-sky-600 hover:underline">Forgot your password?</a>
          </div>

          {error && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {error}
            </Alert>
          )}

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading}
            sx={{ textTransform: "none", background: "linear-gradient(90deg,#0ea5a4,#0284c7)" }}
          >
            {loading ? "Signing in..." : `Log in as ${accountType === "doctor" ? "Doctor" : "Receptionist"}`}
          </Button>

          {/* <div className="flex items-center gap-3">
            <div className="h-px bg-slate-200 flex-1" />
            <div className="text-sm text-slate-400">or sign in with</div>
            <div className="h-px bg-slate-200 flex-1" />
          </div> */}

          {/* <Button variant="outlined" fullWidth startIcon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 12.3c0-.63-.06-1.24-.18-1.82H12v3.44h4.84c-.21 1.1-.86 2.03-1.82 2.66v2.2h2.94c1.72-1.58 2.72-3.93 2.72-6.48z" fill="#4285F4" />
              <path d="M12 21c2.43 0 4.47-.8 5.96-2.16l-2.94-2.2c-.82.56-1.86.9-3.02.9-2.32 0-4.29-1.56-4.99-3.65H3.95v2.29C5.44 19.93 8.45 21 12 21z" fill="#34A853" />
              <path d="M7.01 13.89A5.99 5.99 0 0 1 6.4 12c0-.66.12-1.28.34-1.87V7.84H3.95A9 9 0 0 0 3 12c0 1.48.35 2.88.96 4.16l3.05-2.27z" fill="#FBBC05" />
              <path d="M12 6.5c1.32 0 2.52.46 3.46 1.36l2.6-2.6C16.45 3.86 14.43 3 12 3 8.45 3 5.44 4.07 3.95 6.33l3.05 2.29C7.71 8.06 9.68 6.5 12 6.5z" fill="#EA4335" />
            </svg>
          }>
            Sign in with Google
          </Button> */}

          {/* <p className="text-center text-sm text-slate-500 mt-2">
            Don't have an account? <a className="text-sky-600 hover:underline" href="/register">Register here</a>
          </p> */}
        </Box>
      </div>

      {/* Right section - Full height illustration */}
      <div className="hidden md:flex flex-col justify-center items-center flex-1 bg-gradient-to-br from-sky-800 via-indigo-800 to-violet-700 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(45deg,_rgba(255,255,255,0.2)_0px,_rgba(255,255,255,0.2)_1px,_transparent_1px,_transparent_10px)]"></div>
        <div className="relative z-10 px-10 text-center text-white">
          <h3 className="text-3xl font-semibold mb-4">Secure by design</h3>
          <p className="text-base text-slate-100 max-w-md mx-auto">
            EchoAide encrypts patient data, supports HIPAA-compliant workflows,
            and provides a secure transcription environment for clinicians.
          </p>
          <div className="mt-10">
            <svg viewBox="0 0 600 200" className="w-full h-32">
              <path d="M0 100 L50 100 L80 70 L110 130 L140 50 L180 130 L240 50 L300 100 L600 100" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
