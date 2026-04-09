import {
    createContext,
    ReactNode,
    useContext,
    useEffect,
    useState,
} from 'react';
import { authApi } from '../api/auth';
import type { AuthResponse } from '../api/auth';
import { User } from '../types';

interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<AuthResponse>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser]         = useState<User | null>(null);
    const [token, setToken]       = useState<string | null>(localStorage.getItem('token'));
    const [isLoading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            authApi.me()
                .then(data => setUser(data))
                .catch(() => {
                    localStorage.removeItem('token');
                    setToken(null);
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [token]);

    const login = async (email: string, password: string): Promise<AuthResponse> => {
        const data = await authApi.login(email, password);
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user);
        return data;
    };

    const logout = () => {
        authApi.logout().finally(() => {
            localStorage.removeItem('token');
            setToken(null);
            setUser(null);
        });
    };

    return (
        <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
};