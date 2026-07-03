import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { ArrowRight, Lock, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { AuthAlert, AuthCard, AuthFooter, AuthHeader } from '../components/auth/AuthPrimitives.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { variants } from '../lib/utils/animations.js';

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const redirectTo = location.state?.from?.pathname || '/dashboard';

  const emailLooksValid = useMemo(() => /\S+@\S+\.\S+/.test(form.email), [form.email]);

  const updateField = (event) => {
    const { name, type, checked, value } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setFieldErrors((current) => ({ ...current, [name]: '' }));
  };

  const validate = () => {
    const nextErrors = {};
    if (!emailLooksValid) nextErrors.email = 'Enter a valid email address';
    if (!form.password) nextErrors.password = 'Enter your password';
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    if (!validate()) return;
    setIsSubmitting(true);

    try {
      await login({ email: form.email, password: form.password });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to log in');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard>
      <AuthHeader
        eyebrow="Welcome back"
        title="Continue your meetings"
        description="Sign in to open your rooms, recordings, files, and meeting history without breaking your flow."
        icon={ShieldCheck}
      />

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-3.5 z-10 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="login-email"
            label="Email address"
            type="email"
            name="email"
            value={form.email}
            onChange={updateField}
            error={fieldErrors.email}
            className="pl-10" labelClassName="left-10"
            required
          />
        </div>

        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-3.5 z-10 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="login-password"
            label="Password"
            type="password"
            name="password"
            value={form.password}
            onChange={updateField}
            error={fieldErrors.password}
            className="pl-10 pr-11" labelClassName="left-10"
            required
          />
        </div>

        <div className="flex items-center justify-between gap-4 pt-1">
          <label className="group flex cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground">
            <input
              type="checkbox"
              name="remember"
              checked={form.remember}
              onChange={updateField}
              className="h-4 w-4 rounded border-input bg-background accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="transition group-hover:text-foreground">Remember me</span>
          </label>
          <Link to="/forgot-password" className="text-sm font-semibold text-primary transition hover:text-primary/80">
            Forgot password?
          </Link>
        </div>

        <AnimatePresence>
          {error && <AuthAlert>{error}</AuthAlert>}
        </AnimatePresence>

        <Button data-testid="login-submit" type="submit" className="w-full rounded-xl" size="lg" isLoading={isSubmitting}>
          Sign in
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <Motion.div variants={variants.fade} initial="initial" animate="animate" className="mt-6 rounded-2xl border border-border/70 bg-secondary/35 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Joining someone else's room?</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Enter as a guest and keep the account step for later.</p>
            <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => navigate('/guest')}>
              Join as guest
            </Button>
          </div>
        </div>
      </Motion.div>

      <AuthFooter>
        Don't have an account?{' '}
        <Link to="/signup" className="font-semibold text-primary transition hover:text-primary/80">
          Create one
        </Link>
      </AuthFooter>
    </AuthCard>
  );
}

export default Login;
