import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import JobCard from '../components/JobCard.jsx';
import { SkeletonList, EmptyState, ErrorState } from '../components/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

/**
 * The 5 steps, applied:
 *   1. state  2. fetch  3. render  4. handle the button  5. show errors
 *
 * Step 4 here is unsaving a job. Note the optimistic update: the bookmark
 * removes immediately and is rolled back if the server rejects it. Waiting for
 * the round-trip first makes the button feel broken on a slow connection.
 */
export default function SavedJobs() {
  const { user } = useAuth();
  const toast = useToast();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getSavedJobs();
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unsave = async (job) => {
    setJobs((list) => list.filter((j) => j.id !== job.id));
    try {
      await api.unsaveJob(job.id);
      toast.info('Removed from saved jobs.');
    } catch (err) {
      setJobs((list) => [...list, job]);   // put it back
      toast.error(err.message);
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Saved jobs</h1>
          <p className="muted">Jobs you bookmarked. They stay here until you remove them.</p>
        </div>
      </header>

      {loading && <SkeletonList count={3} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && jobs.length === 0 && (
        <EmptyState
          icon="★"
          title="No saved jobs yet"
          message="Tap the bookmark on any job to keep it here for later."
          actionTo="/jobs"
          actionLabel="Browse jobs"
        />
      )}

      <div className="job-list">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={{ ...job, isSaved: true }}
            onToggleSave={unsave}
            canApply={user?.role === 'seeker'}
          />
        ))}
      </div>
    </>
  );
}
