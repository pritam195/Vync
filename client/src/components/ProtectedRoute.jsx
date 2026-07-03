import { Navigate, useLocation } from 'react-router-dom';
import { LoadingState } from './StateBlock.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function ProtectedRoute({ children }) {
  const { isAuthenticated, isGuest, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState message="Loading session..." />;
  }

  if (!isAuthenticated && !isGuest) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

export default ProtectedRoute;
