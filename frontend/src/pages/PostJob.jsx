import JobForm from '../components/JobForm.jsx';

export default function PostJob() {
  return (
    <>
      <h1>Post a job</h1>
      <p className="muted">
        Only your account can see a draft. A live job appears in search immediately.
      </p>
      <JobForm mode="create" />
    </>
  );
}