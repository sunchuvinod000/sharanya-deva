import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AddFarmer from './pages/AddFarmer.jsx';
import FarmerList from './pages/FarmerList.jsx';
import RequestDetail from './pages/RequestDetail.jsx';
import DistrictQueue from './pages/DistrictQueue.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/add-farmer" element={<AddFarmer />} />
        <Route path="/farmers" element={<FarmerList />} />
        <Route path="/farmers/:id" element={<RequestDetail />} />
        <Route path="/district-queue" element={<DistrictQueue />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
