import { Outlet } from 'react-router-dom';
import Navbar from './Navbar.jsx';
import PageTransition from './PageTransition.jsx';

function LandingLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 w-full overflow-x-hidden">
      <Navbar />
      <main className="w-full pt-14">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
    </div>
  );
}

export default LandingLayout;
