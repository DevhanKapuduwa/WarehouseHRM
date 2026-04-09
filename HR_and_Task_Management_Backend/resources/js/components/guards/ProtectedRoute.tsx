import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface Props {
    children: ReactNode;
    requiredRole: 'management' | 'worker';
}

export const ProtectedRoute = ({ children, requiredRole }: Props) => {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950">
                <div className="text-white text-lg">Loading...</div>
            </div>
        );
    }

    if (!user) return <Navigate to="/login" replace />;

    const isManagementSide = user.role === 'management' || user.role === 'supervisor' || user.role === 'hr';
    if ((requiredRole === 'management' && !isManagementSide) || (requiredRole === 'worker' && user.role !== 'worker')) {
        return (
            <Navigate
                to={isManagementSide ? '/management' : '/worker'}
                replace
            />
        );
    }

    return children;
};