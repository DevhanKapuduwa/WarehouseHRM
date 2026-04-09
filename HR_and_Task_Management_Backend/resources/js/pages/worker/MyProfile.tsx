import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workerApi } from '../../api/workers';
import { Loader2, Save, UserCircle } from 'lucide-react';

const GENDER_OPTIONS = ['Male', 'Female', 'Other'] as const;
const EDUCATION_OPTIONS = ["High School", "Bachelor's", "Master's", 'PhD'] as const;
const MARITAL_OPTIONS = ['Single', 'Married', 'Divorced'] as const;

const emptySelf = {
    age: '' as string | number,
    gender: '',
    education_level: '',
    marital_status: '',
    joined_date: '',
};

export default function MyProfile() {
    const qc = useQueryClient();
    const [form, setForm] = useState(emptySelf);
    const [msg, setMsg] = useState('');

    const { data: profile, isLoading, error } = useQuery({
        queryKey: ['worker-profile'],
        queryFn: workerApi.myProfile,
    });

    useEffect(() => {
        if (!profile) return;
        setForm({
            age: profile.age ?? '',
            gender: profile.gender ?? '',
            education_level: profile.education_level ?? '',
            marital_status: profile.marital_status ?? '',
            joined_date: profile.joined_date
                ? String(profile.joined_date).slice(0, 10)
                : '',
        });
    }, [profile]);

    const saveMut = useMutation({
        mutationFn: workerApi.updateMyProfile,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['worker-profile'] });
            setMsg('Profile saved.');
            setTimeout(() => setMsg(''), 3000);
        },
        onError: (e: any) => setMsg(e.response?.data?.message || 'Could not save'),
    });

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        setMsg('');
        saveMut.mutate({
            age: form.age === '' ? undefined : Number(form.age),
            gender: form.gender || undefined,
            education_level: form.education_level || undefined,
            marital_status: form.marital_status || undefined,
            joined_date: form.joined_date || undefined,
        });
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-24">
                <Loader2 className="animate-spin text-green-400" size={28} />
            </div>
        );
    }

    if (error) {
        return <div className="text-red-400 text-sm">Could not load profile.</div>;
    }

    const m = profile?.profile_metrics;

    return (
        <div className="max-w-3xl space-y-8">
            <div className="flex items-center gap-3">
                <UserCircle className="text-green-400" size={32} />
                <div>
                    <h1 className="text-2xl font-bold">My profile</h1>
                    <p className="text-gray-500 text-sm">
                        Employee ID <span className="font-mono text-gray-300">{profile?.employee_id}</span>
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-5">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Your information</h2>
                <p className="text-xs text-gray-500 -mt-2">
                    Complete these fields. Tenure and hours below update automatically from your join date and time logs.
                </p>

                <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-gray-400 text-xs mb-1">Age</label>
                        <input
                            type="number"
                            min={16}
                            max={120}
                            value={form.age}
                            onChange={e => setForm({ ...form, age: e.target.value })}
                            className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-green-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-gray-400 text-xs mb-1">Gender</label>
                        <select
                            value={form.gender}
                            onChange={e => setForm({ ...form, gender: e.target.value })}
                            className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-green-500 focus:outline-none"
                        >
                            <option value="">Select…</option>
                            {GENDER_OPTIONS.map(v => (
                                <option key={v} value={v}>
                                    {v}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-gray-400 text-xs mb-1">Education level</label>
                        <select
                            value={form.education_level}
                            onChange={e => setForm({ ...form, education_level: e.target.value })}
                            className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-green-500 focus:outline-none"
                        >
                            <option value="">Select…</option>
                            {EDUCATION_OPTIONS.map(v => (
                                <option key={v} value={v}>
                                    {v}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-gray-400 text-xs mb-1">Marital status</label>
                        <select
                            value={form.marital_status}
                            onChange={e => setForm({ ...form, marital_status: e.target.value })}
                            className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-green-500 focus:outline-none"
                        >
                            <option value="">Select…</option>
                            {MARITAL_OPTIONS.map(v => (
                                <option key={v} value={v}>
                                    {v}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-gray-400 text-xs mb-1">Joined date</label>
                        <input
                            type="date"
                            value={form.joined_date}
                            onChange={e => setForm({ ...form, joined_date: e.target.value })}
                            className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 focus:border-green-500 focus:outline-none max-w-xs"
                        />
                    </div>
                </div>

                {msg && (
                    <div className={`text-sm px-3 py-2 rounded-lg ${msg.includes('saved') ? 'bg-green-900/30 text-green-300 border border-green-800' : 'bg-red-900/30 text-red-300 border border-red-800'}`}>
                        {msg}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={saveMut.isPending}
                    className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm px-5 py-2.5 rounded-lg transition"
                >
                    {saveMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save
                </button>
            </form>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">From management</h2>
                <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Job role</dt>
                        <dd className="text-gray-200">{profile?.job_role ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Department</dt>
                        <dd className="text-gray-200">{profile?.department ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Salary</dt>
                        <dd className="text-gray-200">
                            {profile?.salary != null ? Number(profile.salary).toLocaleString() : '—'}
                        </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Work location</dt>
                        <dd className="text-gray-200">{profile?.work_location ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Training hours</dt>
                        <dd className="text-gray-200">{profile?.training_hours ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Promotions</dt>
                        <dd className="text-gray-200">{profile?.promotions ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Absenteeism (management)</dt>
                        <dd className="text-gray-200">{profile?.absenteeism ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Distance from home (km)</dt>
                        <dd className="text-gray-200">{profile?.distance_from_home ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2 sm:col-span-2">
                        <dt className="text-gray-500">Manager feedback score</dt>
                        <dd className="text-gray-200">{profile?.manager_feedback_score ?? '—'}</dd>
                    </div>
                </dl>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Calculated from your activity</h2>
                <p className="text-xs text-gray-600 -mt-1">
                    Work–life balance follows your engagement &amp; events attendance rate (present ÷ all marks).
                    Overtime, absence, and lateness vs your scheduled shifts use an 8h standard day and are summed per calendar month.
                </p>
                <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Tenure</dt>
                        <dd className="text-gray-200">{m?.tenure?.label ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Projects completed</dt>
                        <dd className="text-gray-200">{m?.projects_completed ?? 0}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Hours worked (this month)</dt>
                        <dd className="text-gray-200">{m?.total_hours_worked_this_month ?? 0}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Overtime hours (this month)</dt>
                        <dd className="text-gray-200">{m?.overtime_hours ?? 0}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Absenteeism units (this month)</dt>
                        <dd className="text-gray-200">{m?.absenteeism_units ?? 0}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Shortage remainder (this month, h)</dt>
                        <dd className="text-gray-200">{m?.shortage_hours_remainder ?? 0}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Avg. monthly hours worked</dt>
                        <dd className="text-gray-200">{m?.average_monthly_hours_worked ?? 0}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2">
                        <dt className="text-gray-500">Engagement attendance %</dt>
                        <dd className="text-gray-200">
                            {m?.engagement_attendance_pct != null ? `${m.engagement_attendance_pct}%` : '—'}
                        </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-800/80 pb-2 sm:col-span-2">
                        <dt className="text-gray-500">Work–life balance</dt>
                        <dd className="text-gray-200 font-medium">{m?.work_life_balance ?? '—'}</dd>
                    </div>
                </dl>
                {m?.monthly_work_stats && m.monthly_work_stats.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-800">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">By month</h3>
                        <div className="overflow-x-auto text-xs">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-gray-500 border-b border-gray-800">
                                        <th className="py-1 pr-2">Month</th>
                                        <th className="py-1 pr-2">Worked (h)</th>
                                        <th className="py-1 pr-2">OT (h)</th>
                                        <th className="py-1 pr-2">Absent. units</th>
                                        <th className="py-1 pr-2">Short. rem. (h)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...m.monthly_work_stats].reverse().slice(0, 12).map((row) => (
                                        <tr key={row.year_month} className="border-b border-gray-800/60 text-gray-300">
                                            <td className="py-1 pr-2 font-mono">{row.year_month}</td>
                                            <td className="py-1 pr-2">{row.total_hours_worked}</td>
                                            <td className="py-1 pr-2">{row.overtime_hours}</td>
                                            <td className="py-1 pr-2">{row.absenteeism_units}</td>
                                            <td className="py-1 pr-2">{row.shortage_hours_remainder}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
