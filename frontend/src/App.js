import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import Landing from "@/pages/Landing";
import GetOffersStart from "@/pages/GetOffersStart";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Verify from "@/pages/Verify";
import CustomerDashboard from "@/pages/CustomerDashboard";
import CreateRequest from "@/pages/CreateRequest";
import RideDetail from "@/pages/RideDetail";
import DriverDashboard from "@/pages/DriverDashboard";
import DriverEarnings from "@/pages/DriverEarnings";
import AdminDashboard from "@/pages/AdminDashboard";
import Support from "@/pages/Support";
import Payment from "@/pages/Payment";
import Messages from "@/pages/Messages";
import CancelRefundPolicy from "@/pages/CancelRefundPolicy";
import Profile from "@/pages/Profile";
import "@/App.css";

function roleHomePath(role) {
  if (role === "admin") return "/admin";
  if (role === "driver") return "/driver";
  return "/customer";
}

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  const isVerified = user.role === "admin" || (user.email_verified && user.phone_verified);
  if (!isVerified && location.pathname !== "/verify") return <Navigate to="/verify" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={roleHomePath(user.role)} replace />;
  }
  return children;
}

function AppShell() {
  return (
    <div className="App min-h-screen">
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/get-offers" element={<GetOffersStart />} />
        <Route path="/register" element={<Navigate to="/register/customer" replace />} />
        <Route path="/register/customer" element={<Register defaultRole="customer" lockedRole />} />
        <Route path="/driver/apply" element={<Register defaultRole="driver" lockedRole />} />
        <Route path="/request" element={<CreateRequest guestMode />} />
        <Route path="/verify" element={<ProtectedRoute><Verify /></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
        <Route path="/cancel-refund-policy" element={<CancelRefundPolicy />} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/customer" element={<ProtectedRoute roles={["customer"]}><CustomerDashboard /></ProtectedRoute>} />
        <Route path="/customer/new" element={<ProtectedRoute roles={["customer"]}><CreateRequest /></ProtectedRoute>} />
        <Route path="/ride/:id" element={<ProtectedRoute><RideDetail /></ProtectedRoute>} />
        <Route path="/payment/:id" element={<ProtectedRoute roles={["customer"]}><Payment /></ProtectedRoute>} />
        <Route path="/messages/:id" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
        <Route path="/driver" element={<ProtectedRoute roles={["driver"]}><DriverDashboard /></ProtectedRoute>} />
        <Route path="/driver/earnings" element={<ProtectedRoute roles={["driver"]}><DriverEarnings /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
      </Routes>
      <Toaster theme="dark" position="top-right" richColors />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
