import Sidebar from "./components/Sidebar";
import DashboardHeader from "./components/DashboardHeader";

import {
  matchPath,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import AppShell from "./components/AppShell";
import PublicLayout from "./components/PublicLayout";
import AdminRoute from "./components/AdminRoute";
import NotFoundPage from "./pages/NotFoundPage";
import HowItWorksPage from "./pages/HowItWorksPage";
import SchedulePage from "./pages/SchedulePage";
import AccountPage from "./pages/AccountPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ConfirmEmailPage from "./pages/ConfirmEmailPage";
import DialogEscapeHandler from "./components/DialogEscapeHandler";

import ScrollToTop from "./components/TopScroll";

import DashboardPage from "./pages/DashboardPage";
import PatientDashboardPage from "./pages/PatientDashboardPage";
import PatientsPage from "./pages/PatientsPage";
import AddPatientPage from "./pages/AddPatientPage";
import TodaysAppointmentsPage from "./pages/TodaysAppointmentsPage";
import BookAppointmentPage from "./pages/BookAppointmentPage";
import CalendarPage from "./pages/CalendarPage";
import CheckInPatientPage from "./pages/CheckInPatientPage";
import CurrentQueuePage from "./pages/CurrentQueuePage";
import Footer from "./components/Footer";
import FaqPage from "./pages/FaqPage";
import ContactPage from "./pages/ContactPage";
import ProviderStatusPage from "./pages/ProviderStatusPage";
import AboutUsPage from "./pages/AboutUs";
import StaffDirectoryPage from "./pages/StaffDirectory";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPortalPage from "./pages/LoginPortalPage";
import StaffLoginPage from "./pages/StaffLoginPage";
import PatientLoginPage from "./pages/PatientLoginPage";
import PatientRegisterPage from "./pages/PatientRegisterPage";
import PatientCheckEmailPage from "./pages/PatientCheckEmailPage";
import PatientVerifyEmailPage from "./pages/PatientVerifyEmailPage";
import PatientProtectedRoute from "./components/PatientProtectedRoute";
import PatientSidebar from "./components/PatientSidebar";
import PatientAppointmentsPage from "./pages/PatientAppointmentsPage";
import { usePatientAuth } from "./context/PatientAuthContext";
import PatientDashboardHeader from "./components/PatientDashboardHeader";
import PatientLiveQueuePage from "./pages/PatientLiveQueuePage";
import DoctorProtectedRoute from "./components/DoctorProtectedRoute";
import DoctorSidebar from "./components/DoctorSidebar";
import DoctorLoginPage from "./pages/DoctorLoginPage";
import DoctorAcceptInvitePage from "./pages/DoctorAcceptInvitePage";
import StaffAcceptInvitePage from "./pages/StaffAcceptInvitePage";
import DoctorDashboardPage from "./pages/DoctorDashboardPage";
import DoctorQueuePage from "./pages/DoctorQueuePage";
import DoctorAppointmentsPage from "./pages/DoctorAppointmentsPage";
import DoctorStatusPage from "./pages/DoctorStatusPage";
import MissedCancelledAppointmentsPage from "./pages/MissedCancelledAppointmentsPage";
import WaitTimeAnalyticsPage from "./pages/WaitTimeAnalyticsPage";
function App() {
  const location = useLocation();
  const { patient } = usePatientAuth();

  // LOGIN PAGE
  // Do not render Sidebar, Header, Footer, or dashboard layout.
const isLoginPage =
  location.pathname.startsWith("/login") ||
  location.pathname === "/doctor/login" ||
  location.pathname === "/doctor/accept-invite" ||
  location.pathname === "/staff/accept-invite" ||
  location.pathname === "/patient/login" ||
  location.pathname === "/patient/register" ||
  location.pathname === "/patient/check-email" ||
  location.pathname === "/patient/verify-email" ||
  location.pathname === "/forgot-password" ||
  location.pathname === "/reset-password" ||
  location.pathname === "/confirm-email";

if (isLoginPage) {
  return (
    <>
      <ScrollToTop />
      <DialogEscapeHandler />

      <Routes>
        <Route
          path="/login"
          element={<LoginPortalPage />}
        />

        <Route
          path="/login/staff"
          element={<StaffLoginPage />}
        />

        <Route
          path="/doctor/login"
          element={<DoctorLoginPage />}
        />

        <Route
          path="/doctor/accept-invite"
          element={<DoctorAcceptInvitePage />}
        />

        <Route
          path="/staff/accept-invite"
          element={<StaffAcceptInvitePage />}
        />

        <Route
          path="/patient/login"
          element={<PatientLoginPage />}
        />

        <Route
          path="/patient/register"
          element={<PatientRegisterPage />}
        />

        <Route
          path="/patient/check-email"
          element={<PatientCheckEmailPage />}
        />

        <Route
          path="/patient/verify-email"
          element={<PatientVerifyEmailPage />}
        />
        <Route
          path="/forgot-password"
          element={<ForgotPasswordPage />}
        />
        <Route
          path="/reset-password"
          element={<ResetPasswordPage />}
        />
        <Route
          path="/confirm-email"
          element={<ConfirmEmailPage />}
        />
      </Routes>
    </>
  );
}

/*
 * Pages anyone can read, signed in or not.
 */
const isPublicPage = ["/about", "/faq", "/contact", "/how-it-works"].includes(
  location.pathname,
);

if (isPublicPage) {
  return (
    <>
      <ScrollToTop />
      <DialogEscapeHandler />
      <PublicLayout>
        <Routes>
          <Route path="/about" element={<AboutUsPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
        </Routes>
      </PublicLayout>
    </>
  );
}

/*
 * Unknown address: a "page not found" page instead of a
 * blank screen or a login redirect.
 */
const isKnownPage = KNOWN_APP_PATHS.some((pattern) =>
  matchPath(pattern, location.pathname),
);

if (!isKnownPage) {
  return (
    <PublicLayout>
      <NotFoundPage />
    </PublicLayout>
  );
}

const isPatientPage =
  location.pathname.startsWith(
    "/patient/",
  );

if (isPatientPage) {
  return (
    <>
      <ScrollToTop />
      <DialogEscapeHandler />
      <PatientProtectedRoute>
        <AppShell
          sidebar={<PatientSidebar />}
          header={<PatientDashboardHeader />}
        >
          <Routes>
            <Route
              path="/patient/dashboard"
              element={<PatientDashboardPage />}
            />
            <Route
              path="/patient/appointments"
              element={<PatientAppointmentsPage />}
            />
            <Route
              path="/patient/book"
              element={
                <BookAppointmentPage
                  mode="patient"
                  loggedInPatient={patient}
                />
              }
            />
            <Route
              path="/patient/queue"
              element={<PatientLiveQueuePage />}
            />
            <Route
              path="/patient/account"
              element={<AccountPage portal="patient" />}
            />
          </Routes>
        </AppShell>
      </PatientProtectedRoute>
    </>
  );
}

const isDoctorPage =
  location.pathname.startsWith(
    "/doctor/",
  );

if (isDoctorPage) {
  return (
    <>
      <ScrollToTop />
      <DialogEscapeHandler />
      <DoctorProtectedRoute>
        <AppShell sidebar={<DoctorSidebar />}>
          <Routes>
            <Route
              path="/doctor/dashboard"
              element={<DoctorDashboardPage />}
            />
            <Route
              path="/doctor/appointments"
              element={<DoctorAppointmentsPage />}
            />
            <Route
              path="/doctor/queue"
              element={<DoctorQueuePage />}
            />
            <Route
              path="/doctor/status"
              element={<DoctorStatusPage />}
            />
            <Route
              path="/doctor/account"
              element={<AccountPage portal="staff" />}
            />
          </Routes>
        </AppShell>
      </DoctorProtectedRoute>
    </>
  );
}

  // EVERYTHING ELSE REQUIRES A STAFF LOGIN
  return (
    <>
      <ScrollToTop />
      <DialogEscapeHandler />
      <ProtectedRoute>
        <AppShell
          sidebar={<Sidebar />}
          header={<DashboardHeader />}
          footer={<Footer />}
        >
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/patients" element={<PatientsPage />} />
            <Route path="/patients/add" element={<AddPatientPage />} />
            <Route
              path="/patients/:patientId/edit"
              element={<AddPatientPage />}
            />
            <Route
              path="/appointments/today"
              element={<TodaysAppointmentsPage />}
            />
            <Route
              path="/appointments/history"
              element={<MissedCancelledAppointmentsPage />}
            />
            <Route
              path="/appointments/book"
              element={<BookAppointmentPage />}
            />
            <Route
              path="/appointments/calendar"
              element={<CalendarPage />}
            />
            <Route
              path="/queue/check-in"
              element={<CheckInPatientPage />}
            />
            <Route
              path="/queue/current"
              element={<CurrentQueuePage />}
            />
            <Route
              path="/provider-status"
              element={<ProviderStatusPage />}
            />
            {/* Admin only (the server enforces this too). */}
            <Route
              path="/staff"
              element={
                <AdminRoute>
                  <StaffDirectoryPage />
                </AdminRoute>
              }
            />
            <Route
              path="/account"
              element={<AccountPage portal="staff" />}
            />
            <Route
              path="/schedule"
              element={
                <AdminRoute>
                  <SchedulePage />
                </AdminRoute>
              }
            />
            <Route
              path="/analytics/wait-times"
              element={
                <AdminRoute>
                  <WaitTimeAnalyticsPage />
                </AdminRoute>
              }
            />
          </Routes>
        </AppShell>
      </ProtectedRoute>
    </>
  );
}

/*
 * Every signed-in page. Anything else is "page not found".
 */
const KNOWN_APP_PATHS = [
  "/",
  "/dashboard",
  "/patients",
  "/patients/add",
  "/patients/:patientId/edit",
  "/appointments/today",
  "/appointments/history",
  "/appointments/book",
  "/appointments/calendar",
  "/queue/check-in",
  "/queue/current",
  "/provider-status",
  "/staff",
  "/schedule",
  "/account",
  "/patient/account",
  "/doctor/account",
  "/analytics/wait-times",
  "/patient/dashboard",
  "/patient/appointments",
  "/patient/book",
  "/patient/queue",
  "/doctor/dashboard",
  "/doctor/appointments",
  "/doctor/queue",
  "/doctor/status",
];

export default App;