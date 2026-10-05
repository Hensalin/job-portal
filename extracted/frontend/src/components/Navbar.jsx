import { Link, NavLink, useNavigate } from 'react-router-dom';

export default function Navbar({ user, onLogout }) {
  const navigate = useNavigate();
  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  return (
    <header className="nav">
      <Link to="/jobs" className="brand">Jobboard</Link>
      <nav>
        <NavLink to="/jobs">Jobs</NavLink>
        {user ? (
          <>
            <NavLink to="/dashboard">Dashboard</NavLink>
            <span className="who">{user.fullName}</span>
            <button className="btn btn-quiet" onClick={handleLogout}>Log out</button>
          </>
        ) : (
          <>
            <NavLink to="/login">Log in</NavLink>
            <Link to="/register" className="btn">Create account</Link>
          </>
        )}
      </nav>
    </header>
  );
}
