import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type LoginRole = 'management' | 'worker';

export default function Login() {
    const [tab, setTab]             = useState<LoginRole>('management');
    const [email, setEmail]         = useState('');
    const [password, setPassword]   = useState('');
    const [error, setError]         = useState('');
    const [loading, setLoading]     = useState(false);
    const { login, logout, user }   = useAuth();
    const navigate                  = useNavigate();

    if (user) {
        navigate((user.role === 'management' || user.role === 'supervisor' || user.role === 'hr') ? '/management' : '/worker', { replace: true });
        return null;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const data = await login(email, password);
            const role = data.user.role;
            const isAdminSide = role === 'management' || role === 'supervisor' || role === 'hr';
            if (tab === 'management' && !isAdminSide) {
                logout();
                setError(
                    'These credentials are for a Worker account. Please use the Worker tab to sign in.'
                );
            } else if (tab === 'worker' && role !== 'worker') {
                logout();
                setError(
                    'These credentials are for a Management / Supervisor / HR account. Please use the Management tab to sign in.'
                );
            }
        } catch (err: unknown) {
            const ax = err as { response?: { data?: { message?: string } } };
            setError(ax.response?.data?.message || 'Login failed.');
        } finally {
            setLoading(false);
        }
    };

    const isManagement = tab === 'management';

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-6">
                    <div className="text-5xl mb-4">🏭</div>
                    <h1 className="text-3xl font-bold text-white">Warehouse HRM</h1>
                    <p className="text-gray-400 mt-2">
                        {isManagement ? 'Management sign in' : 'Worker sign in'}
                    </p>
                </div>

                {/* Role tabs */}
                <div className="flex gap-2 mb-6">
                    <button
                        type="button"
                        onClick={() => { setTab('management'); setError(''); }}
                        className={`flex-1 rounded-xl py-3.5 px-4 text-center font-semibold transition border ${
                            isManagement
                                ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/30'
                                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                        }`}
                    >
                        <span className="block text-sm">🏢 Management</span>
                        <span className="block text-xs mt-0.5 opacity-80">Full control panel</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => { setTab('worker'); setError(''); }}
                        className={`flex-1 rounded-xl py-3.5 px-4 text-center font-semibold transition border ${
                            !isManagement
                                ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/30'
                                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                        }`}
                    >
                        <span className="block text-sm">👷 Worker</span>
                        <span className="block text-xs mt-0.5 opacity-80">Tasks & time tracking</span>
                    </button>
                </div>

                <div className={`bg-gray-900 rounded-2xl p-8 shadow-2xl border ${
                    isManagement ? 'border-blue-900/50' : 'border-emerald-900/50'
                }`}>
                    {error && (
                        <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-gray-400 text-sm mb-1">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder={isManagement ? 'manager@warehouse.com' : 'you@warehouse.com'}
                                required
                                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gray-700 focus:outline-none transition focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-gray-400 text-sm mb-1">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gray-700 focus:outline-none transition focus:border-blue-500"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full font-semibold py-3 rounded-lg transition disabled:opacity-50 text-white ${
                                isManagement
                                    ? 'bg-blue-600 hover:bg-blue-700'
                                    : 'bg-emerald-600 hover:bg-emerald-700'
                            }`}
                        >
                            {loading ? 'Signing in...' : (isManagement ? 'Management Sign In' : 'Worker Sign In')}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}