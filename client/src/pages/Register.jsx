import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowRight, Image, Lock, Mail, Sparkles, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { AuthAlert, AuthCard, AuthFooter, AuthHeader, PasswordStrength } from '../components/auth/AuthPrimitives.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';

function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    avatar: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const strength = useMemo(() => {
    let score = 0;
    if (form.password.length > 5) score += 1;
    if (form.password.length > 8) score += 1;
    if (/[A-Z]/.test(form.password)) score += 1;
    if (/[0-9]|[^A-Za-z0-9]/.test(form.password)) score += 1;
    return Math.min(score, 4);
  }, [form.password]);

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [event.target.name]: '' }));
  };

  const validate = () => {
    const nextErrors = {};
    if (form.name.trim().length < 2) nextErrors.name = 'Use at least 2 characters';
    if (!/\S+@\S+\.\S+/.test(form.email)) nextErrors.email = 'Enter a valid email address';
    if (form.password.length < 6) nextErrors.password = 'Use at least 6 characters';
    if (form.avatar && !/^https?:\/\//i.test(form.avatar)) nextErrors.avatar = 'Use a full https:// URL';
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!validate()) return;
    setIsSubmitting(true);

    try {
      await register(form);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard>
      <AuthHeader
        eyebrow="Create access"
        title="Set up your Vync space"
        description="Create a profile for instant rooms, saved recordings, shared files, and a smoother collaboration trail."
        icon={Sparkles}
      />

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="relative">
          <User className="pointer-events-none absolute left-3 top-3.5 z-10 h-4 w-4 text-muted-foreground" />
          <Input data-testid="register-name" label="Full name" type="text" name="name" value={form.name} onChange={updateField} error={fieldErrors.name} className="pl-10" labelClassName="left-10" required />
        </div>

        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-3.5 z-10 h-4 w-4 text-muted-foreground" />
          <Input data-testid="register-email" label="Email address" type="email" name="email" value={form.email} onChange={updateField} error={fieldErrors.email} className="pl-10" labelClassName="left-10" required />
        </div>

        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-3.5 z-10 h-4 w-4 text-muted-foreground" />
          <Input data-testid="register-password" label="Password" type="password" name="password" value={form.password} minLength={6} onChange={updateField} error={fieldErrors.password} className="pl-10 pr-11" labelClassName="left-10" required />
        </div>

        {form.password.length > 0 && (
          <div>
            <PasswordStrength
              strength={strength}
              labels={['Very weak', 'Weak', 'Fair', 'Good', 'Strong']}
              colors={['bg-error', 'bg-error', 'bg-warning', 'bg-success/80', 'bg-success']}
            />
          </div>
        )}

        <div className="relative">
          <Image className="pointer-events-none absolute left-3 top-3.5 z-10 h-4 w-4 text-muted-foreground" />
          <Input label="Avatar URL (optional)" type="url" name="avatar" value={form.avatar} onChange={updateField} error={fieldErrors.avatar} className="pl-10" labelClassName="left-10" />
        </div>

        <AnimatePresence>
          {error && (
            <div>
              <AuthAlert>{error}</AuthAlert>
            </div>
          )}
        </AnimatePresence>

        <div className="rounded-xl border border-border/70 bg-secondary/30 p-3 text-xs leading-5 text-muted-foreground">
          Meeting history, recordings, and uploaded resources stay connected to your workspace.
        </div>

        <Button data-testid="register-submit" type="submit" className="w-full rounded-xl" size="lg" isLoading={isSubmitting}>
          Create account
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <AuthFooter>
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-primary transition hover:text-primary/80">
          Sign in
        </Link>
      </AuthFooter>
    </AuthCard>
  );
}

export default Register;
