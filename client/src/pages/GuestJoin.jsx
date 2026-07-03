import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, UserSquare2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { AuthCard, AuthFooter, AuthHeader } from '../components/auth/AuthPrimitives.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';

export default function GuestJoin() {
  const [guestName, setGuestName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { joinAsGuest } = useAuth();
  const navigate = useNavigate();

  const handleGuestJoin = (event) => {
    event.preventDefault();

    if (guestName.trim().length < 2) {
      setError('Use at least 2 characters for your display name');
      return;
    }

    setError('');
    setIsSubmitting(true);
    joinAsGuest(guestName);
    navigate('/dashboard');
  };

  return (
    <AuthCard>
      <AuthHeader
        eyebrow="Guest access"
        title="Join without an account"
        description="Use a temporary display name to explore Vync or join a room quickly. You can create an account later."
        icon={UserSquare2}
      />

      <form onSubmit={handleGuestJoin} className="space-y-4">
        <div className="relative">
          <Sparkles className="pointer-events-none absolute left-3 top-3.5 z-10 h-4 w-4 text-muted-foreground" />
          <Input
            label="Display name"
            type="text"
            value={guestName}
            onChange={(event) => {
              setGuestName(event.target.value);
              setError('');
            }}
            error={error}
            className="pl-10" labelClassName="left-10"
            required
          />
        </div>

        <Button type="submit" className="w-full rounded-full" size="lg" isLoading={isSubmitting}>
          Continue as guest
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <div className="mt-6 rounded-2xl border border-border/70 bg-secondary/25 p-4 text-sm leading-6 text-muted-foreground">
        Guest sessions are local and temporary. Create an account when you want saved preferences and meeting history.
      </div>

      <AuthFooter>
        Want to save your preferences?{' '}
        <Link to="/signup" className="font-semibold text-primary transition hover:text-primary/80">
          Create an account
        </Link>
        <br />
        Already have one?{' '}
        <Link to="/login" className="font-semibold text-primary transition hover:text-primary/80">
          Sign in
        </Link>
      </AuthFooter>
    </AuthCard>
  );
}
