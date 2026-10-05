import { Link, useParams } from 'react-router-dom';
import JobForm from '../components/JobForm.jsx';

export default function EditJob() {
  const { id } = useParams();
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Edit job</h1>
          <p className="muted">Changes go live as soon as you save.</p>
        </div>
        <Link className="btn btn-quiet" to={`/jobs/${id}/applicants`}>View applicants</Link>
      </header>
      <JobForm mode="edit" />
    </>
  );
}