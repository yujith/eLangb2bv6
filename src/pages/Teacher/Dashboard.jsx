import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
    PenTool, Mic, CheckCircle, Users, ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function TeacherDashboard() {
    const { profile } = useAuth();
    const [counts, setCounts] = useState({
        writingQueue: 0, speakingQueue: 0, reviewed: 0, students: 0,
    });
    const [loadingCounts, setLoadingCounts] = useState(true);

    useEffect(() => { fetchCounts(); }, []);

    const fetchCounts = async () => {
        try {
            const [
                { count: writingQueue },
                { count: speakingQueue },
                { count: writingReviewed },
                { count: speakingReviewed },
                { count: studentCount },
            ] = await Promise.all([
                supabase.from('writing_submissions').select('*', { count: 'exact', head: true }).in('status', ['ai_graded', 'submitted']),
                supabase.from('speaking_submissions').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
                supabase.from('writing_submissions').select('*', { count: 'exact', head: true }).eq('status', 'teacher_reviewed'),
                supabase.from('speaking_submissions').select('*', { count: 'exact', head: true }).eq('status', 'teacher_reviewed'),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student').eq('status', 'active'),
            ]);

            setCounts({
                writingQueue: writingQueue || 0,
                speakingQueue: speakingQueue || 0,
                reviewed: (writingReviewed || 0) + (speakingReviewed || 0),
                students: studentCount || 0,
            });
        } catch (err) {
            console.error('Error fetching counts:', err);
        } finally {
            setLoadingCounts(false);
        }
    };

    const stats = [
        { icon: PenTool, label: 'Writing Queue', value: loadingCounts ? '...' : counts.writingQueue, color: 'blue', to: '/teacher/writing-review' },
        { icon: Mic, label: 'Speaking Queue', value: loadingCounts ? '...' : counts.speakingQueue, color: 'red', to: '/teacher/speaking-review' },
        { icon: CheckCircle, label: 'Reviewed', value: loadingCounts ? '...' : counts.reviewed, color: 'green', to: '/teacher/writing-review' },
        { icon: Users, label: 'Students', value: loadingCounts ? '...' : counts.students, color: 'cyan', to: '/teacher/students' },
    ];

    return (
        <div className="animate-fade-in">
            <h1 className="page-title">Welcome, {profile?.full_name?.split(' ')[0] || 'Teacher'}</h1>
            <p className="page-subtitle">Your teaching dashboard — review student work and track progress.</p>

            <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
                {stats.map((stat, i) => (
                    <Link key={i} to={stat.to} className="stat-card" style={{ textDecoration: 'none' }}>
                        <div className={`stat-icon ${stat.color}`}>
                            <stat.icon size={22} />
                        </div>
                        <div className="stat-value">{stat.value}</div>
                        <div className="stat-label">{stat.label}</div>
                    </Link>
                ))}
            </div>

            <div className="grid grid-2">
                <Link to="/teacher/writing-review" className="card" style={{ textDecoration: 'none' }}>
                    <div className="flex items-center gap-3">
                        <div className="stat-icon blue"><PenTool size={20} /></div>
                        <div>
                            <div className="font-semibold">Writing Review</div>
                            <div className="text-sm text-muted">Read essays, compare with AI feedback, assign final scores</div>
                        </div>
                        <ArrowRight size={18} style={{ marginLeft: 'auto', color: 'var(--color-neutral-300)' }} />
                    </div>
                </Link>

                <Link to="/teacher/speaking-review" className="card" style={{ textDecoration: 'none' }}>
                    <div className="flex items-center gap-3">
                        <div className="stat-icon red"><Mic size={20} /></div>
                        <div>
                            <div className="font-semibold">Speaking Review</div>
                            <div className="text-sm text-muted">Listen to recordings and grade per IELTS criteria</div>
                        </div>
                        <ArrowRight size={18} style={{ marginLeft: 'auto', color: 'var(--color-neutral-300)' }} />
                    </div>
                </Link>
            </div>
        </div>
    );
}
