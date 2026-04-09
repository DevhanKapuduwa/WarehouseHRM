import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/guards/ProtectedRoute';

import Login from './pages/Login';
import ManagementLayout from './components/layouts/ManagementLayout';
import WorkerLayout from './components/layouts/WorkerLayout';
import ManagementDashboard from './pages/management/Dashboard';
import Workers from './pages/management/Workers';
import Tasks from './pages/management/Tasks';
import TimeLogs from './pages/management/TimeLogs';
import Reports from './pages/management/Reports';
import Engagement from './pages/management/Engagement';
import LeaveApprovals from './pages/management/LeaveApprovals';
import FaceRecognition from './pages/management/FaceRecognition';
import WorkerDashboard from './pages/worker/Dashboard';
import MyTasks from './pages/worker/MyTasks';
import MyHours from './pages/worker/MyHours';
import TaskNavigate from './pages/worker/TaskNavigate';
import Leave from './pages/worker/Leave';
import MyProfile from './pages/worker/MyProfile';
import MyFaceLogs from './pages/worker/MyFaceLogs';

const queryClient = new QueryClient();

const RootRedirect = () => {
    const { user, isLoading } = useAuth();
    if (isLoading) return null;
    if (!user) return <Navigate to="/login" replace />;
    return (user.role === 'management' || user.role === 'supervisor' || user.role === 'hr')
        ? <Navigate to="/management" replace />
        : <Navigate to="/worker" replace />;
};

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/"      element={<RootRedirect />} />
                        <Route path="/login" element={<Login />} />

                        <Route path="/management" element={
                            <ProtectedRoute requiredRole="management">
                                <ManagementLayout />
                            </ProtectedRoute>
                        }>
                            <Route index              element={<ManagementDashboard />} />
                            <Route path="workers"     element={<Workers />} />
                            <Route path="tasks"       element={<Tasks />} />
                            <Route path="timelogs"    element={<TimeLogs />} />
                            <Route path="engagement"  element={<Engagement />} />
                            <Route path="leave"       element={<LeaveApprovals />} />
                            <Route path="face-logs"   element={<FaceRecognition />} />
                            <Route path="reports"     element={<Reports />} />
                        </Route>

                        <Route path="/worker" element={
                            <ProtectedRoute requiredRole="worker">
                                <WorkerLayout />
                            </ProtectedRoute>
                        }>
                            <Route index            element={<WorkerDashboard />} />
                            <Route path="my-tasks"  element={<MyTasks />} />
                            <Route path="my-hours"  element={<MyHours />} />
                            <Route path="leave"     element={<Leave />} />
                            <Route path="face-logs" element={<MyFaceLogs />} />
                            <Route path="profile" element={<MyProfile />} />
                            <Route path="tasks/:id/navigate" element={<TaskNavigate />} />
                        </Route>
                    </Routes>
                </BrowserRouter>
            </AuthProvider>
        </QueryClientProvider>
    );
}