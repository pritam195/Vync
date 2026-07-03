import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import StateBlock from '../components/StateBlock.jsx';

function NotFound() {
  return (
    <section className="mx-auto grid min-h-[55vh] max-w-xl place-items-center">
      <StateBlock
        action={
          <Link className="ui-button ui-button-primary rounded-xl" to="/">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        }
        message="The page you requested does not exist or may have moved."
        title="Page not found"
        tone="error"
      />
    </section>
  );
}

export default NotFound;
