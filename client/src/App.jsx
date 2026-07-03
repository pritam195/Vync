import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import LandingLayout from './components/LandingLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AuthLayout from './components/AuthLayout.jsx';
import { LoadingState } from './components/StateBlock.jsx';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const GuestJoin = lazy(() => import('./pages/GuestJoin.jsx'));
const Home = lazy(() => import('./pages/Home.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Meeting = lazy(() => import('./pages/Meeting.jsx'));
const MeetingDetails = lazy(() => import('./pages/MeetingDetails.jsx'));
const MeetingHistory = lazy(() => import('./pages/MeetingHistory.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const OTPVerification = lazy(() => import('./pages/OTPVerification.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));

function App() {
  return (
    <Suspense fallback={<div className="page-shell pt-24"><LoadingState message="Loading Vync..." /></div>}>
      <Routes>
        <Route element={<LandingLayout />}>
          <Route path="/" element={<Home />} />
        </Route>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Register />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify-otp" element={<OTPVerification />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/guest" element={<GuestJoin />} />
        </Route>
        <Route element={<AppLayout />}>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/meetings/history"
            element={
              <ProtectedRoute>
                <MeetingHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/meetings/history/:meetingId"
            element={
              <ProtectedRoute>
                <MeetingDetails />
              </ProtectedRoute>
            }
          />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="/meeting/:meetingId" element={<Meeting />} />
      </Routes>
    </Suspense>
  );
}

export default App;
