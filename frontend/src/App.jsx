import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

import Jobs from './pages/Jobs.jsx';
import JobDetails from './pages/JobDetails.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './pages/Profile.jsx';
import CompanyProfile from './pages/CompanyProfile.jsx';
import CompanyPublic from './pages/CompanyPublic.jsx';
import PostJob from './pages/PostJob.jsx';
import EditJob from './pages/EditJob.jsx';
import Applicants from './pages/Applicants.jsx';
import SavedJobs from './pages/SavedJobs.jsx';
import MyApplications from './pages/MyApplications.jsx';
import Notifications from './pages/Notifications.jsx';
import Alerts from './pages/Alerts.jsx';
import Admin from './pages/Admin.jsx';
import ApplicantProfile from './pages/ApplicantProfile.jsx';

/**
 * `guard(roles, element)` wraps a page in ProtectedRoute.
 * Read it as: "/saved is for logged-in people only".
 */
const guard = (element, roles) => (
  <ProtectedRoute roles={roles}>{element}</ProtectedRoute>
);

export default function App() {
  return (
    <>
      <Navbar />
      <main className="page">
        <Routes>
          <Route path="/" element={<Navigate to="/jobs" replace />} />

          {/* ---------- public ---------- */}
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetails />} />
          <Route path="/companies/:id" element={<CompanyPublic />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* ---------- any signed-in user ---------- */}
          <Route path="/dashboard" element={guard(<Dashboard />)} />
          <Route path="/profile" element={guard(<Profile />)} />
          <Route path="/notifications" element={guard(<Notifications />)} />
          <Route path="/saved" element={guard(<SavedJobs />)} />
          <Route path="/applications" element={guard(<MyApplications />)} />
          <Route path="/alerts" element={guard(<Alerts />)} />
          <Route path="/applicants/:id" element={guard(<ApplicantProfile />, ['employer', 'admin'])} />

          {/* ---------- employers only ---------- */}
          <Route path="/post-job" element={guard(<PostJob />, ['employer'])} />
          <Route path="/jobs/:id/edit" element={guard(<EditJob />, ['employer'])} />
          <Route path="/jobs/:id/applicants" element={guard(<Applicants />, ['employer'])} />
          <Route path="/company" element={guard(<CompanyProfile />, ['employer'])} />

          {/* ---------- admins only ---------- */}
          <Route path="/admin" element={guard(<Admin />, ['admin'])} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}

function NotFound() {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">🧭</div>
      <h2>Page not found</h2>
      <p className="muted">That address does not match any page in this app.</p>
      <a className="btn" href="/jobs">Browse jobs</a>
    </div>
  );
}