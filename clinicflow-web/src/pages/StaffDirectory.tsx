import { apiFetch } from "../lib/api";
import {
  MailPlus,
  MoreHorizontal,
  Plus,
  Search,
  Stethoscope,
  UserRoundCog,
  Users,
  UsersRound,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "../context/AuthContext";

/* =========================================================
   TYPES
========================================================= */

type ProviderStatus =
  | "available"
  | "in_consult"
  | "unavailable";

// physician = doctors table; admin / receptionist =
// staff_users logins.
type StaffRole =
  | "physician"
  | "admin"
  | "receptionist";

type StaffLoginRole =
  | "admin"
  | "receptionist";

type StaffMember = {
  id: number;

  first_name: string;
  last_name: string;

  role: StaffRole;

  specialty: string | null;

  email: string | null;
  phone: string | null;

  is_active: boolean;

  provider_status: ProviderStatus | null;
  status_reason: string | null;
  status_updated_at: string | null;

  staff_type: "doctor" | "staff";

  // Staff logins only: invited but no password set yet.
  invite_pending: boolean;
  invite_expires_at: string | null;
};

/* =========================================================
   PAGE
========================================================= */

function StaffDirectoryPage() {
  const {
    staff,
  } = useAuth();

  /* =======================================================
     PERMISSIONS
  ======================================================= */

  const canManageStaff =
    staff?.role === "admin";

  /* =======================================================
     STATE
  ======================================================= */

  const [
    staffMembers,
    setStaffMembers,
  ] = useState<StaffMember[]>([]);

  const [
    searchTerm,
    setSearchTerm,
  ] = useState("");

  const [
    roleFilter,
    setRoleFilter,
  ] = useState<
    "all" | StaffRole
  >("all");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    showAddStaffModal,
    setShowAddStaffModal,
  ] = useState(false);

  const [
    addingStaff,
    setAddingStaff,
  ] = useState(false);

  const [
    addStaffError,
    setAddStaffError,
  ] = useState("");

  const [
  successMessage,
  setSuccessMessage,
] = useState("");

  const [
    newStaff,
    setNewStaff,
  ] = useState({
    firstName: "",
    lastName: "",
    role: "receptionist" as StaffRole,
    specialty: "",
    email: "",
    phone: "",
  });

  const [
    selectedStaff,
    setSelectedStaff,
  ] = useState<StaffMember | null>(
    null,
  );

  const [
    showStaffProfile,
    setShowStaffProfile,
  ] = useState(false);

  const [
    openActionMenu,
    setOpenActionMenu,
  ] = useState<string | null>(
    null,
  );

  const [
    staffToArchive,
    setStaffToArchive,
  ] = useState<StaffMember | null>(
    null,
  );

  const [
    archivingStaff,
    setArchivingStaff,
  ] = useState(false);

  const [
    archiveError,
    setArchiveError,
  ] = useState("");

  const [
  activatingStaff,
  setActivatingStaff,
] = useState(false);

  // Errors from row actions (activate, resend invite),
  // shown as a toast.
  const [
    actionError,
    setActionError,
  ] = useState("");

  const [
    resendingInviteId,
    setResendingInviteId,
  ] = useState<number | null>(null);

  const [
  staffToEdit,
  setStaffToEdit,
] = useState<StaffMember | null>(null);

const [
  showEditStaffModal,
  setShowEditStaffModal,
] = useState(false);

const [
  editingStaff,
  setEditingStaff,
] = useState(false);

const [
  editStaffError,
  setEditStaffError,
] = useState("");

const [
  editStaff,
  setEditStaff,
] = useState({
  firstName: "",
  lastName: "",
  specialty: "",
  email: "",
  phone: "",
  role: "receptionist" as StaffLoginRole,
});

  /* =======================================================
     CURRENT USER
     An admin cannot archive or demote themselves.
  ======================================================= */

  function isCurrentUser(
    staffMember: StaffMember,
  ) {
    return (
      staffMember.staff_type ===
        "staff" &&
      staffMember.id ===
        staff?.staff_user_id
    );
  }


  /* =======================================================
     LOAD STAFF DIRECTORY
  ======================================================= */

  useEffect(() => {
    async function loadStaff() {
      try {
        setLoading(true);
        setErrorMessage("");

        const response =
          await apiFetch(
            "/api/staff",
            {
              headers: {
              },
            },
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ??
              "Unable to load staff directory.",
          );
        }

        setStaffMembers(data);
      } catch (error) {
        console.error(
          "Error loading staff directory:",
          error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load staff directory.",
        );
      } finally {
        setLoading(false);
      }
    }

    if (staff) {
      loadStaff();
    }
  }, [staff]);

  /* =======================================================
     FILTER STAFF
  ======================================================= */

  const filteredStaff =
    useMemo(() => {
      const normalizedSearch =
        searchTerm
          .trim()
          .toLowerCase();

      return staffMembers.filter(
        (staffMember) => {
          const fullName =
            `${staffMember.first_name} ${staffMember.last_name}`
              .toLowerCase();

          const matchesSearch =
            normalizedSearch.length ===
              0 ||
            fullName.includes(
              normalizedSearch,
            ) ||
            staffMember.email
              ?.toLowerCase()
              .includes(
                normalizedSearch,
              ) ||
            staffMember.specialty
              ?.toLowerCase()
              .includes(
                normalizedSearch,
              ) ||
            getRoleLabel(
              staffMember.role,
            )
              .toLowerCase()
              .includes(
                normalizedSearch,
              );

          const matchesRole =
            roleFilter === "all" ||
            staffMember.role ===
              roleFilter;

          return (
            matchesSearch &&
            matchesRole
          );
        },
      );
    }, [
      staffMembers,
      searchTerm,
      roleFilter,
    ]);

  /* =======================================================
     SUMMARY TOTALS
  ======================================================= */

  const totalStaff =
    staffMembers.filter(
      (staffMember) =>
        staffMember.is_active,
    ).length;

  const totalDoctors =
    staffMembers.filter(
      (staffMember) =>
        staffMember.staff_type ===
          "doctor" &&
        staffMember.is_active,
    ).length;

  const totalReceptionists =
    staffMembers.filter(
      (staffMember) =>
        staffMember.role ===
          "receptionist" &&
        staffMember.is_active,
    ).length;
  
  const totalPendingInvites =
    staffMembers.filter(
      (staffMember) =>
        staffMember.invite_pending &&
        staffMember.is_active,
    ).length;

  /* =======================================================
     VIEW PROFILE
  ======================================================= */

  function handleViewStaff(
    staffMember: StaffMember,
  ) {
    setSelectedStaff(
      staffMember,
    );

    setShowStaffProfile(true);

    setOpenActionMenu(null);
  }

  function handleOpenEditStaff(
  staffMember: StaffMember,
) {
  setStaffToEdit(staffMember);

  setEditStaff({
    firstName: staffMember.first_name,
    lastName: staffMember.last_name,
    specialty: staffMember.specialty ?? "",
    email: staffMember.email ?? "",
    phone: staffMember.phone ?? "",
    role:
      staffMember.role === "admin"
        ? "admin"
        : "receptionist",
  });

  setEditStaffError("");
  setShowEditStaffModal(true);
  setOpenActionMenu(null);
}

async function handleSaveStaffEdit() {
  if (!canManageStaff) {
    setEditStaffError(
      "You do not have permission to edit staff.",
    );
    return;
  }

  if (!staff || !staffToEdit) {
    setEditStaffError(
      "Authentication required.",
    );
    return;
  }

  // Phone is optional for admin / receptionist logins.
  if (
    !editStaff.firstName.trim() ||
    !editStaff.lastName.trim() ||
    !editStaff.email.trim() ||
    (staffToEdit.staff_type ===
      "doctor" &&
      !editStaff.phone.trim())
  ) {
    setEditStaffError(
      "Please complete all required fields.",
    );
    return;
  }

  try {
    setEditingStaff(true);
    setEditStaffError("");

    const response = await apiFetch(
      `/api/staff/${staffToEdit.staff_type}/${staffToEdit.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify(
          staffToEdit.staff_type ===
            "doctor"
            ? {
                firstName:
                  editStaff.firstName,
                lastName:
                  editStaff.lastName,
                specialty:
                  editStaff.specialty,
                email: editStaff.email,
                phone: editStaff.phone,
              }
            : editStaff,
        ),
      },
    );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ??
          "Unable to update staff member.",
      );
    }

    setStaffMembers((current) =>
      current.map((member) =>
        member.id ===
          staffToEdit.id &&
        member.staff_type ===
          staffToEdit.staff_type
          ? staffToEdit.staff_type ===
            "staff"
            ? (data as StaffMember)
            : {
              ...member,
              first_name:
                editStaff.firstName.trim(),
              last_name:
                editStaff.lastName.trim(),
              specialty:
                staffToEdit.staff_type ===
                "doctor"
                  ? editStaff.specialty.trim()
                  : member.specialty,
              email:
                editStaff.email.trim(),
              phone:
                editStaff.phone.trim(),
            }
          : member,
      ),
    );

    setSuccessMessage(
      `${editStaff.firstName} ${editStaff.lastName}'s profile was updated successfully.`,
    );

    setTimeout(() => {
      setSuccessMessage("");
    }, 4000);

    setShowEditStaffModal(false);
    setStaffToEdit(null);
  } catch (error) {
    console.error(
      "Error updating staff member:",
      error,
    );

    setEditStaffError(
      error instanceof Error
        ? error.message
        : "Unable to update staff member.",
    );
  } finally {
    setEditingStaff(false);
  }
}

  /* =======================================================
     ADD STAFF
     ADMIN ONLY
  ======================================================= */

  async function handleAddStaff() {
    if (!canManageStaff) {
      setAddStaffError(
        "You do not have permission to add staff members.",
      );

      return;
    }

    if (!staff) {
      setAddStaffError(
        "Authentication required.",
      );

      return;
    }

    try {
      setAddingStaff(true);
      setAddStaffError("");

      if (
  !newStaff.firstName.trim() ||
  !newStaff.lastName.trim() ||
  !newStaff.role ||
  !newStaff.email.trim() ||
  (newStaff.role === "physician" &&
    (!newStaff.phone.trim() ||
      !newStaff.specialty.trim()))
) {
  setAddStaffError(
    "Please complete all required fields.",
  );

  return;
}

      const response =
        await apiFetch(
          "/api/staff",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

            },

            body: JSON.stringify(
              newStaff,
            ),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ??
            "Unable to add staff member.",
        );
      }

      const {
        emailSent,
        ...createdStaff
      } = data as StaffMember & {
        emailSent?: boolean;
      };

      setStaffMembers(
        (current) => [
          ...current,
          createdStaff,
        ],
      );

      // Admin / receptionist logins are activated by the
      // person themselves from the emailed invite.
      setSuccessMessage(
  newStaff.role === "physician"
    ? `${newStaff.firstName} ${newStaff.lastName} was added successfully.`
    : emailSent
      ? `${newStaff.firstName} ${newStaff.lastName} was added. An invitation to set a password was sent to ${createdStaff.email}.`
      : `${newStaff.firstName} ${newStaff.lastName} was added, but the invitation email could not be sent. Use "Resend invite" to try again.`,
);

setTimeout(() => {
  setSuccessMessage("");
}, 4000);

      setNewStaff({
        firstName: "",
        lastName: "",
        role: "receptionist",
        specialty: "",
        email: "",
        phone: "",
      });

      setShowAddStaffModal(
        false,
      );
    } catch (error) {
      console.error(
        "Error adding staff member:",
        error,
      );

      setAddStaffError(
        error instanceof Error
          ? error.message
          : "Unable to add staff member.",
      );
    } finally {
      setAddingStaff(false);
    }
  }

  /* =======================================================
     ARCHIVE STAFF
     ADMIN ONLY
  ======================================================= */

  async function handleArchiveStaff() {
    if (!canManageStaff) {
      setArchiveError(
        "You do not have permission to archive staff members.",
      );

      return;
    }

    if (!staff) {
      setArchiveError(
        "Authentication required.",
      );

      return;
    }

    if (!staffToArchive) {
      return;
    }

    try {
      setArchivingStaff(true);
      setArchiveError("");

      const response =
        await apiFetch(
          `/api/staff/${staffToArchive.staff_type}/${staffToArchive.id}/archive`,
          {
            method: "PATCH",

            headers: {
            },
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ??
            "Unable to archive staff member.",
        );
      }

      setStaffMembers(
        (current) =>
          current.map(
            (staffMember) =>
              staffMember.id ===
                staffToArchive.id &&
              staffMember.staff_type ===
                staffToArchive.staff_type
                ? {
                    ...staffMember,
                    is_active:
                      false,
                  }
                : staffMember,
          ),
      );

      setStaffToArchive(null);

      setOpenActionMenu(null);
    } catch (error) {
      console.error(
        "Error archiving staff member:",
        error,
      );

      setArchiveError(
        error instanceof Error
          ? error.message
          : "Unable to archive staff member.",
      );
    } finally {
      setArchivingStaff(false);
    }
  }

  async function handleActivateStaff(
  staffMember: StaffMember,
) {
  if (!canManageStaff) {
    return;
  }

  if (!staff) {
    setActionError(
      "Authentication required.",
    );
    return;
  }

  try {
    setActivatingStaff(true);
    setActionError("");

    const response = await apiFetch(
      `/api/staff/${staffMember.staff_type}/${staffMember.id}/activate`,
      {
        method: "PATCH",
        headers: {
        },
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ??
          "Unable to activate staff member.",
      );
    }

    setStaffMembers((current) =>
      current.map((member) =>
        member.id === staffMember.id &&
        member.staff_type ===
          staffMember.staff_type
          ? {
              ...member,
              is_active: true,
            }
          : member,
      ),
    );

    setOpenActionMenu(null);
  } catch (error) {
    console.error(
      "Error activating staff member:",
      error,
    );

    setActionError(
      error instanceof Error
        ? error.message
        : "Unable to activate staff member.",
    );
  } finally {
    setActivatingStaff(false);
  }
}

  /* =======================================================
     RESEND STAFF INVITE
     ADMIN ONLY - for logins that have no password yet
  ======================================================= */

async function handleResendInvite(
  staffMember: StaffMember,
) {
  if (
    !canManageStaff ||
    staffMember.staff_type !==
      "staff" ||
    !staffMember.invite_pending
  ) {
    return;
  }

  try {
    setResendingInviteId(
      staffMember.id,
    );
    setActionError("");

    const response = await apiFetch(
      `/api/staff/staff/${staffMember.id}/resend-invite`,
      {
        method: "POST",
      },
    );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ??
          "Unable to resend the invitation.",
      );
    }

    if (data.staff) {
      setStaffMembers((current) =>
        current.map((member) =>
          member.id ===
            staffMember.id &&
          member.staff_type ===
            "staff"
            ? (data.staff as StaffMember)
            : member,
        ),
      );
    }

    setOpenActionMenu(null);

    setSuccessMessage(
      data.emailSent
        ? `A new invitation was sent to ${staffMember.email}.`
        : "Invitation created, but the email could not be sent.",
    );

    setTimeout(() => {
      setSuccessMessage("");
    }, 4000);
  } catch (error) {
    console.error(
      "Error resending staff invite:",
      error,
    );

    setActionError(
      error instanceof Error
        ? error.message
        : "Unable to resend the invitation.",
    );
  } finally {
    setResendingInviteId(null);
  }
}

async function handleInviteDoctor(
  staffMember: StaffMember,
) {
  if (!canManageStaff) {
    return;
  }

  if (!staff) {
    setSuccessMessage(
      "Authentication required.",
    );

    return;
  }

  if (
    staffMember.staff_type !==
    "doctor"
  ) {
    return;
  }

  try {
    const response = await apiFetch(
      `/api/staff/doctors/${staffMember.id}/invite`,
      {
        method: "POST",
        headers: {
        },
      },
    );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ??
          "Unable to create doctor portal invite.",
      );
    }

    setOpenActionMenu(null);

    setSuccessMessage(
      data.emailSent
        ? `Doctor Portal invitation sent to ${staffMember.email}.`
        : "Invitation created, but the email could not be sent.",
    );

    setTimeout(() => {
      setSuccessMessage("");
    }, 4000);
  } catch (error) {
    console.error(
      "Error inviting doctor:",
      error,
    );

    window.alert(
      error instanceof Error
        ? error.message
        : "Unable to create doctor portal invite.",
    );
  }
}

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <main className="min-h-screen bg-[#f7fafc] px-6 py-10 lg:px-10">

      {successMessage && (
  <div className="fixed right-6 top-6 z-[100] w-full max-w-sm rounded-xl border border-emerald-200 bg-white px-5 py-4 shadow-xl">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-emerald-700">
          Success
        </p>

        <p className="mt-1 text-sm text-slate-600">
          {successMessage}
        </p>
      </div>

      <button
        type="button"
        onClick={() =>
          setSuccessMessage("")
        }
        className="text-slate-400 transition hover:text-slate-700"
      >
        <X size={18} />
      </button>
    </div>
  </div>
)}

      {actionError && (
  <div className="fixed right-6 top-6 z-[100] w-full max-w-sm rounded-xl border border-red-200 bg-white px-5 py-4 shadow-xl">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-red-700">
          Something went wrong
        </p>

        <p className="mt-1 text-sm text-slate-600">
          {actionError}
        </p>
      </div>

      <button
        type="button"
        onClick={() =>
          setActionError("")
        }
        className="text-slate-400 transition hover:text-slate-700"
      >
        <X size={18} />
      </button>
    </div>
  </div>
)}
      <div className="mx-auto max-w-[1500px]">

        {/* =================================================
            PAGE HEADER
        ================================================= */}

        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#13B2B3]">
              <Users className="h-5 w-5" />

              <span>
                Clinic team
              </span>
            </div>

            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
              Staff Directory
            </h1>

            <p className="mt-2 text-lg font-normal text-slate-500">
              View physicians,
              reception staff, and
              clinic administrators.
            </p>
          </div>

          {/* ADMIN ONLY */}

          {canManageStaff && (
            <button
              type="button"
              onClick={() => {
                setAddStaffError(
                  "",
                );

                setShowAddStaffModal(
                  true,
                );
              }}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#13B2B3] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0fa4a5]"
            >
              <Plus className="h-5 w-5" />

              Add Staff
            </button>
          )}
        </div>

        {/* =================================================
            SUMMARY CARDS
        ================================================= */}

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Total staff"
            value={totalStaff}
            icon={UsersRound}
            iconClassName="bg-cyan-50 text-[#13B2B3]"
          />

          <SummaryCard
            title="Physicians"
            value={totalDoctors}
            icon={Stethoscope}
            iconClassName="bg-blue-50 text-blue-600"
          />

          <SummaryCard
            title="Reception"
            value={
              totalReceptionists
            }
            icon={UserRoundCog}
            iconClassName="bg-violet-50 text-violet-600"
          />

          <SummaryCard
            title="Invites pending"
            value={
              totalPendingInvites
            }
            icon={MailPlus}
            iconClassName="bg-amber-50 text-amber-600"
          />
        </div>

        {/* =================================================
            DIRECTORY CARD
        ================================================= */}

        <section className="mt-7 rounded-2xl border border-slate-200 bg-white shadow-sm">

          {/* SEARCH + FILTER */}

          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-[560px]">
              <Search
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="text"
                value={searchTerm}
                onChange={(
                  event,
                ) =>
                  setSearchTerm(
                    event.target
                      .value,
                  )
                }
                placeholder="Search staff..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#13B2B3] focus:bg-white focus:ring-4 focus:ring-cyan-50"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(
                event,
              ) =>
                setRoleFilter(
                  event.target
                    .value as
                    | "all"
                    | StaffRole,
                )
              }
              className="min-w-[210px] rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-medium text-slate-700 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-cyan-50"
            >
              <option value="all">
                All roles
              </option>

              <option value="physician">
                Physicians
              </option>

              <option value="receptionist">
                Receptionists
              </option>

              <option value="admin">
                Administrators
              </option>
            </select>
          </div>

          {/* =================================================
              LOADING
          ================================================= */}

          {loading && (
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-[#13B2B3]" />

                <p className="mt-4 text-sm font-medium text-slate-500">
                  Loading staff
                  directory...
                </p>
              </div>
            </div>
          )}

          {/* =================================================
              ERROR
          ================================================= */}

          {!loading &&
            errorMessage && (
              <div className="px-6 py-14 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
                  !
                </div>

                <p className="mt-4 text-base font-semibold text-slate-900">
                  Unable to load
                  staff
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  {errorMessage}
                </p>
              </div>
            )}

          {/* =================================================
              TABLE
          ================================================= */}

          {!loading &&
            !errorMessage && (
              <div className="overflow-visible">
                <table className="w-full min-w-[960px]">

                  {/* HEADER */}

                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-left">
                      <th className="px-7 py-5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Staff Member
                      </th>

                      <th className="px-6 py-5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Role
                      </th>

                      <th className="px-6 py-5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Department /
                        Specialty
                      </th>

                      <th className="px-6 py-5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Contact
                      </th>

                      <th className="px-6 py-5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Status
                      </th>

                      <th className="px-7 py-5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  {/* ROWS */}

                  <tbody>
                    {filteredStaff.map(
                      (
                        staffMember,
                      ) => (
                        <tr
                          key={`${staffMember.staff_type}-${staffMember.id}`}
                          className="border-b border-slate-100 transition last:border-b-0 hover:bg-slate-50/60"
                        >

                          {/* STAFF MEMBER */}

                          <td className="px-7 py-6">
                            <div className="flex items-center gap-4">
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-sm font-semibold text-[#13B2B3] ring-1 ring-cyan-100">
                                {getInitials(
                                  staffMember.first_name,
                                  staffMember.last_name,
                                )}
                              </div>

                              <div>
                                <p className="text-base font-semibold text-slate-900">
                                  {staffMember.staff_type ===
                                  "doctor"
                                    ? "Dr. "
                                    : ""}

                                  {
                                    staffMember.first_name
                                  }{" "}
                                  {
                                    staffMember.last_name
                                  }
                                </p>

                                <p className="mt-1 text-xs font-medium text-slate-400">
                                  {staffMember.staff_type ===
                                  "doctor"
                                    ? `Doctor ID #${staffMember.id
                                        .toString()
                                        .padStart(
                                          3,
                                          "0",
                                        )}`
                                    : `Staff ID #${staffMember.id
                                        .toString()
                                        .padStart(
                                          3,
                                          "0",
                                        )}`}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* ROLE */}

                          <td className="px-6 py-6">
                            <span className="text-sm font-medium text-slate-700">
                              {getRoleLabel(
                                staffMember.role,
                              )}
                            </span>
                          </td>

                          {/* SPECIALTY */}

                          <td className="px-6 py-6">
                            <p className="text-sm font-normal text-slate-600">
                              {staffMember.staff_type ===
                              "doctor"
                                ? staffMember.specialty ??
                                  "General Practice"
                                : getDepartmentLabel(
                                    staffMember.role,
                                  )}
                            </p>
                          </td>

                          {/* CONTACT */}

                          <td className="px-6 py-6">
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-slate-700">
                                {staffMember.email ??
                                  "No email"}
                              </p>

                              <p className="text-xs font-normal text-slate-400">
                                {staffMember.phone ??
                                  "No phone"}
                              </p>
                            </div>
                          </td>

                          {/* STATUS */}

                          <td className="px-6 py-6">
                            <DirectoryStatusBadge
                              staffMember={
                                staffMember
                              }
                            />
                          </td>

                          {/* ACTIONS */}

                          <td className="px-7 py-6">
                            <div className="flex items-center justify-end gap-2">

                              {/* EVERY STAFF USER CAN VIEW */}

                              <button
                                type="button"
                                onClick={() =>
                                  handleViewStaff(
                                    staffMember,
                                  )
                                }
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                              >
                                View Profile
                              </button>

                              {/* ADMIN ONLY */}

                              {canManageStaff && (
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const menuKey =
                                        `${staffMember.staff_type}-${staffMember.id}`;

                                      setOpenActionMenu(
                                        (
                                          current,
                                        ) =>
                                          current ===
                                          menuKey
                                            ? null
                                            : menuKey,
                                      );
                                    }}
                                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                    aria-label={`More options for ${staffMember.first_name} ${staffMember.last_name}`}
                                  >
                                    <MoreHorizontal
                                      size={
                                        18
                                      }
                                    />
                                  </button>

                              {openActionMenu ===
  `${staffMember.staff_type}-${staffMember.id}` && (
  <div className="absolute right-0 top-11 z-40 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
    <button
  type="button"
  onClick={() =>
    handleViewStaff(
      staffMember,
    )
  }
  className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
>
  View profile
</button>

<button
  type="button"
  onClick={() =>
    handleOpenEditStaff(staffMember)
  }
  className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
>
  Edit profile
</button>

{staffMember.staff_type ===
  "doctor" &&
  staffMember.is_active && (
    <button
      type="button"
      onClick={() =>
        handleInviteDoctor(
          staffMember,
        )
      }
      className="w-full px-4 py-2.5 text-left text-sm font-medium text-[#13B2B3] transition hover:bg-cyan-50"
    >
      Invite to Doctor Portal
    </button>
  )}

{staffMember.staff_type ===
  "staff" &&
  staffMember.is_active &&
  staffMember.invite_pending && (
    <button
      type="button"
      disabled={
        resendingInviteId ===
        staffMember.id
      }
      onClick={() =>
        handleResendInvite(
          staffMember,
        )
      }
      className="w-full px-4 py-2.5 text-left text-sm font-medium text-[#13B2B3] transition hover:bg-cyan-50 disabled:opacity-60"
    >
      {resendingInviteId ===
      staffMember.id
        ? "Sending..."
        : "Resend invite"}
    </button>
  )}

<div className="my-1 border-t border-slate-100" />

{isCurrentUser(staffMember) ? (
      <p className="px-4 py-2.5 text-xs text-slate-400">
        You cannot archive your own account.
      </p>
    ) : staffMember.is_active ? (
      <button
        type="button"
        onClick={() => {
          setArchiveError("");

          setStaffToArchive(
            staffMember,
          );

          setOpenActionMenu(
            null,
          );
        }}
        className="w-full px-4 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
      >
        Mark inactive
      </button>
    ) : (
      <button
        type="button"
        disabled={activatingStaff}
        onClick={() =>
          handleActivateStaff(
            staffMember,
          )
        }
        className="w-full px-4 py-2.5 text-left text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
      >
        {activatingStaff
      ? "Activating..."
      : "Mark as active"}
    </button>
    )}
    </div>
    )}
    </div>
    )}
    </div>
    </td>
    </tr>
    ),
    )}
                    {/* EMPTY */}

                    {filteredStaff.length ===
                      0 && (
                      <tr>
                        <td
                          colSpan={
                            6
                          }
                          className="px-6 py-16 text-center"
                        >
                          <UsersRound
                            size={
                              34
                            }
                            className="mx-auto text-slate-300"
                          />

                          <p className="mt-4 text-base font-semibold text-slate-700">
                            No staff
                            members
                            found
                          </p>

                          <p className="mt-1 text-sm text-slate-400">
                            Try
                            changing
                            your search
                            or role
                            filter.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
        </section>
      </div>

      {/* ===================================================
          ADD STAFF MODAL
          ADMIN ONLY
      =================================================== */}

      {canManageStaff &&
        showAddStaffModal && (
          <div data-dialog className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 px-4 py-8 backdrop-blur-[2px]">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">

              {/* HEADER */}

              <div className="flex items-start justify-between border-b border-slate-200 px-7 py-6">
                <div>
                  <p className="text-sm font-semibold text-[#13B2B3]">
                    Clinic team
                  </p>

                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                    Add staff
                    member
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Add a physician
                    or clinic team
                    member to the
                    staff directory.
                    Receptionists and
                    administrators get
                    an email invite to
                    set their own
                    password.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowAddStaffModal(
                      false,
                    )
                  }
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X size={20} />
                </button>
              </div>

              {/* FORM */}

              <div className="max-h-[70vh] overflow-y-auto px-7 py-6">

                {addStaffError && (
                  <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {
                      addStaffError
                    }
                  </div>
                )}

                <div className="grid gap-5 sm:grid-cols-2">

                  {/* FIRST NAME */}

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">
                      First name
                      <span className="ml-1 text-red-500">*</span>
                    </span>

                    <input
                      required
                      value={
                        newStaff.firstName
                      }
                      onChange={(
                        event,
                      ) =>
                        setNewStaff(
                          (
                            current,
                          ) => ({
                            ...current,
                            firstName:
                              event
                                .target
                                .value,
                          }),
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#13B2B3] focus:ring-4 focus:ring-cyan-50"
                      placeholder="First name"
                    />
                  </label>

                  {/* LAST NAME */}

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">
                      Last name
                      <span className="ml-1 text-red-500">*</span>
                    </span>

                    <input
                      required
                      value={
                        newStaff.lastName
                      }
                      onChange={(
                        event,
                      ) =>
                        setNewStaff(
                          (
                            current,
                          ) => ({
                            ...current,
                            lastName:
                              event
                                .target
                                .value,
                          }),
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#13B2B3] focus:ring-4 focus:ring-cyan-50"
                      placeholder="Last name"
                    />
                  </label>

                  {/* ROLE */}

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">
                      Role
                      <span className="ml-1 text-red-500">*</span>
                    </span>

                    <select
                      required
                      value={
                        newStaff.role
                      }
                      onChange={(
                        event,
                      ) =>
                        setNewStaff(
                          (
                            current,
                          ) => ({
                            ...current,

                            role:
                              event
                                .target
                                .value as StaffRole,
                          }),
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#13B2B3] focus:ring-4 focus:ring-cyan-50"
                    >
                      <option value="physician">
                        Physician
                      </option>

                      <option value="receptionist">
                        Receptionist
                      </option>

                      <option value="admin">
                        Administrator
                      </option>
                    </select>
                  </label>

                  {/* SPECIALTY */}

                  {newStaff.role ===
                    "physician" && (
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-700">
                        Specialty
                        <span className="ml-1 text-red-500">*</span>
                      </span>

                      <input
                        required
                        value={
                          newStaff.specialty
                        }
                        onChange={(
                          event,
                        ) =>
                          setNewStaff(
                            (
                              current,
                            ) => ({
                              ...current,

                              specialty:
                                event
                                  .target
                                  .value,
                            }),
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#13B2B3] focus:ring-4 focus:ring-cyan-50"
                        placeholder="Family Medicine"
                      />
                    </label>
                  )}

                  {/* EMAIL */}

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">
                      Email
                      <span className="ml-1 text-red-500">*</span>
                    </span>

                    <input
                      required
                      type="email"
                      value={
                        newStaff.email
                      }
                      onChange={(
                        event,
                      ) =>
                        setNewStaff(
                          (
                            current,
                          ) => ({
                            ...current,

                            email:
                              event
                                .target
                                .value,
                          }),
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#13B2B3] focus:ring-4 focus:ring-cyan-50"
                      placeholder="name@clinicflow.ca"
                    />
                  </label>

                  {/* PHONE */}

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">
                      Phone
                      {newStaff.role ===
                      "physician" ? (
                        <span className="ml-1 text-red-500">*</span>
                      ) : (
                        <span className="ml-1 font-normal text-slate-400">
                          (optional)
                        </span>
                      )}
                    </span>

                    <input
                      required={
                        newStaff.role ===
                        "physician"
                      }
                      value={
                        newStaff.phone
                      }
                      onChange={(
                        event,
                      ) =>
                        setNewStaff(
                          (
                            current,
                          ) => ({
                            ...current,

                            phone:
                              event
                                .target
                                .value,
                          }),
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#13B2B3] focus:ring-4 focus:ring-cyan-50"
                      placeholder="905-555-0000"
                    />
                  </label>
                </div>
              </div>

              {/* FOOTER */}

              <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-7 py-5">
                <button
                  type="button"
                  onClick={() =>
                    setShowAddStaffModal(
                      false,
                    )
                  }
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={
                    handleAddStaff
                  }
                  disabled={
                    addingStaff
                  }
                  className="rounded-xl bg-[#13B2B3] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0fa4a5] disabled:opacity-60"
                >
                  {addingStaff
                    ? "Adding..."
                    : "Add Staff"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================
    EDIT STAFF MODAL
    ADMIN ONLY
=================================================== */}

{canManageStaff &&
  showEditStaffModal &&
  staffToEdit && (
    <div data-dialog className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 px-4 py-8 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">

        {/* HEADER */}

        <div className="flex items-start justify-between border-b border-slate-200 px-7 py-6">
          <div>
            <p className="text-sm font-semibold text-[#13B2B3]">
              Clinic team
            </p>

            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              Edit staff profile
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Update this staff member's contact and profile information.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowEditStaffModal(false);
              setStaffToEdit(null);
              setEditStaffError("");
            }}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        {/* FORM */}

        <div className="max-h-[70vh] overflow-y-auto px-7 py-6">
          {editStaffError && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {editStaffError}
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">

            {/* FIRST NAME */}

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                First name
                <span className="ml-1 text-red-500">*</span>
              </span>

              <input
                required
                value={editStaff.firstName}
                onChange={(event) =>
                  setEditStaff((current) => ({
                    ...current,
                    firstName: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#13B2B3] focus:ring-4 focus:ring-cyan-50"
                placeholder="First name"
              />
            </label>

            {/* LAST NAME */}

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Last name
                <span className="ml-1 text-red-500">*</span>
              </span>

              <input
                required
                value={editStaff.lastName}
                onChange={(event) =>
                  setEditStaff((current) => ({
                    ...current,
                    lastName: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#13B2B3] focus:ring-4 focus:ring-cyan-50"
                placeholder="Last name"
              />
            </label>

            {/* ROLE - admin <-> receptionist for staff logins;
                read only for physicians and for your own
                account. */}

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Role
              </span>

              {staffToEdit.staff_type ===
                "staff" &&
              !isCurrentUser(staffToEdit) ? (
                <select
                  value={editStaff.role}
                  onChange={(event) =>
                    setEditStaff((current) => ({
                      ...current,
                      role: event.target
                        .value as StaffLoginRole,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#13B2B3] focus:ring-4 focus:ring-cyan-50"
                >
                  <option value="receptionist">
                    Receptionist
                  </option>

                  <option value="admin">
                    Administrator
                  </option>
                </select>
              ) : (
                <input
                  value={getRoleLabel(staffToEdit.role)}
                  readOnly
                  title={
                    isCurrentUser(staffToEdit)
                      ? "You cannot change your own role."
                      : undefined
                  }
                  className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 outline-none"
                />
              )}
            </label>

            {/* SPECIALTY - DOCTOR ONLY */}

            {staffToEdit.staff_type === "doctor" && (
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Specialty
                </span>

                <input
                  value={editStaff.specialty}
                  onChange={(event) =>
                    setEditStaff((current) => ({
                      ...current,
                      specialty: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#13B2B3] focus:ring-4 focus:ring-cyan-50"
                  placeholder="Family Medicine"
                />
              </label>
            )}

            {/* EMAIL */}

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Email
                <span className="ml-1 text-red-500">*</span>
              </span>

              <input
                required
                type="email"
                value={editStaff.email}
                onChange={(event) =>
                  setEditStaff((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#13B2B3] focus:ring-4 focus:ring-cyan-50"
                placeholder="name@gmail.com"
              />

              <p className="mt-2 text-xs text-slate-400">
                {staffToEdit.staff_type === "staff" &&
                staffToEdit.invite_pending
                  ? "If you change the email, use Resend invite so the new address gets a working link."
                  : "You can use a Gmail or Hotmail address here for invitation testing."}
              </p>
            </label>

            {/* PHONE */}

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Phone
                {staffToEdit.staff_type ===
                "doctor" ? (
                  <span className="ml-1 text-red-500">*</span>
                ) : (
                  <span className="ml-1 font-normal text-slate-400">
                    (optional)
                  </span>
                )}
              </span>

              <input
                required={
                  staffToEdit.staff_type ===
                  "doctor"
                }
                value={editStaff.phone}
                onChange={(event) =>
                  setEditStaff((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#13B2B3] focus:ring-4 focus:ring-cyan-50"
                placeholder="905-555-0000"
              />
            </label>
          </div>
        </div>

        {/* FOOTER */}

        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-7 py-5">
          <button
            type="button"
            disabled={editingStaff}
            onClick={() => {
              setShowEditStaffModal(false);
              setStaffToEdit(null);
              setEditStaffError("");
            }}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={editingStaff}
            onClick={handleSaveStaffEdit}
            className="rounded-xl bg-[#13B2B3] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0fa4a5] disabled:opacity-60"
          >
            {editingStaff
              ? "Saving..."
              : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  )}

      {/* ===================================================
          STAFF PROFILE
          ALL AUTHENTICATED STAFF CAN VIEW
      =================================================== */}

      {showStaffProfile &&
        selectedStaff && (
          <div data-dialog className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 px-4 py-8 backdrop-blur-[2px]">
            <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">

              {/* HEADER */}

              <div className="flex items-start justify-between border-b border-slate-200 px-7 py-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 font-semibold text-[#13B2B3]">
                    {getInitials(
                      selectedStaff.first_name,
                      selectedStaff.last_name,
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#13B2B3]">
                      Staff
                      profile
                    </p>

                    <h2 className="mt-1 text-xl font-semibold text-slate-950">
                      {selectedStaff.staff_type ===
                      "doctor"
                        ? "Dr. "
                        : ""}

                      {
                        selectedStaff.first_name
                      }{" "}
                      {
                        selectedStaff.last_name
                      }
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      {getRoleLabel(
                        selectedStaff.role,
                      )}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowStaffProfile(
                      false,
                    );

                    setSelectedStaff(
                      null,
                    );
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              {/* PROFILE */}

              <div className="grid gap-5 px-7 py-6 sm:grid-cols-2">
                <ProfileField
                  label={
                    selectedStaff.staff_type ===
                    "doctor"
                      ? "Doctor ID"
                      : "Staff ID"
                  }
                  value={`#${selectedStaff.id
                    .toString()
                    .padStart(
                      3,
                      "0",
                    )}`}
                />

                <ProfileField
                  label="Role"
                  value={getRoleLabel(
                    selectedStaff.role,
                  )}
                />

                <ProfileField
                  label={
                    selectedStaff.staff_type ===
                    "doctor"
                      ? "Specialty"
                      : "Department"
                  }
                  value={
                    selectedStaff.staff_type ===
                    "doctor"
                      ? selectedStaff.specialty ??
                        "General Practice"
                      : getDepartmentLabel(
                          selectedStaff.role,
                        )
                  }
                />

                <ProfileField
                  label="Email"
                  value={
                    selectedStaff.email ??
                    "No email provided"
                  }
                />

                <ProfileField
                  label="Phone"
                  value={
                    selectedStaff.phone ??
                    "No phone provided"
                  }
                />

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Status
                  </p>

                  <div className="mt-2">
                    <DirectoryStatusBadge
                      staffMember={
                        selectedStaff
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-7 py-5">
                <button
                  type="button"
                  onClick={() => {
                    setShowStaffProfile(
                      false,
                    );

                    setSelectedStaff(
                      null,
                    );
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      {/* ===================================================
          ARCHIVE CONFIRMATION
          ADMIN ONLY
      =================================================== */}

      {canManageStaff &&
        staffToArchive && (
          <div data-dialog className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/40 px-4 backdrop-blur-[2px]">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <h2 className="text-xl font-semibold text-slate-950">
                Archive staff
                member?
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-500">
                {staffToArchive.staff_type ===
                "doctor"
                  ? "Dr. "
                  : ""}

                {
                  staffToArchive.first_name
                }{" "}
                {
                  staffToArchive.last_name
                }{" "}
                will be marked
                inactive
                {staffToArchive.staff_type ===
                "staff"
                  ? " and will lose access to ClinicFlow immediately"
                  : ""}
                . Their
                previous records
                will remain in
                ClinicFlow.
              </p>

              {archiveError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {archiveError}
                </div>
              )}

              <div className="mt-7 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={
                    archivingStaff
                  }
                  onClick={() => {
                    setStaffToArchive(
                      null,
                    );

                    setArchiveError(
                      "",
                    );
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={
                    archivingStaff
                  }
                  onClick={
                    handleArchiveStaff
                  }
                  className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {archivingStaff
                    ? "Archiving..."
                    : "Archive"}
                </button>
              </div>
            </div>
          </div>
        )}
    </main>
  );
}

/* =========================================================
   PROFILE FIELD
========================================================= */

function ProfileField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-sm font-medium text-slate-800">
        {value}
      </p>
    </div>
  );
}

/* =========================================================
   SUMMARY CARD
========================================================= */

type SummaryCardProps = {
  title: string;
  value: number;
  icon: React.ElementType;
  iconClassName: string;
};

function SummaryCard({
  title,
  value,
  icon: Icon,
  iconClassName,
}: SummaryCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-medium text-slate-500">
            {title}
          </p>

          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {value}
          </p>
        </div>

        <div
          className={`flex h-14 w-14 items-center justify-center rounded-2xl ${iconClassName}`}
        >
          <Icon size={24} />
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   PROVIDER STATUS
========================================================= */

function ProviderStatusBadge({
  status,
}: {
  status:
    | ProviderStatus
    | null;
}) {
  if (
    status === "available"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />

        Available
      </span>
    );
  }

  if (
    status === "in_consult"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />

        In Consult
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
      <span className="h-2 w-2 rounded-full bg-slate-400" />

      Unavailable
    </span>
  );
}

/* =========================================================
   DIRECTORY STATUS
   Archived > Invite pending > provider status (doctors)
   or Active (staff logins).
========================================================= */

function DirectoryStatusBadge({
  staffMember,
}: {
  staffMember: StaffMember;
}) {
  if (!staffMember.is_active) {
    return (
      <StaffStatusBadge
        isActive={false}
      />
    );
  }

  if (staffMember.invite_pending) {
    const expired =
      staffMember.invite_expires_at !==
        null &&
      new Date(
        staffMember.invite_expires_at,
      ).getTime() <= Date.now();

    return (
      <span
        className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700"
        title={
          expired
            ? "The invitation link has expired. Resend the invite."
            : "Waiting for this person to set their password."
        }
      >
        <span className="h-2 w-2 rounded-full bg-amber-500" />

        {expired
          ? "Invite expired"
          : "Invite pending"}
      </span>
    );
  }

  if (
    staffMember.staff_type ===
    "doctor"
  ) {
    return (
      <ProviderStatusBadge
        status={
          staffMember.provider_status
        }
      />
    );
  }

  return (
    <StaffStatusBadge
      isActive
    />
  );
}

/* =========================================================
   STAFF STATUS
========================================================= */

function StaffStatusBadge({
  isActive,
}: {
  isActive: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
        isActive
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          isActive
            ? "bg-emerald-500"
            : "bg-slate-400"
        }`}
      />

      {isActive
        ? "Active"
        : "Archived"}
    </span>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function getInitials(
  firstName: string,
  lastName: string,
) {
  return `${firstName.charAt(
    0,
  )}${lastName.charAt(
    0,
  )}`.toUpperCase();
}

function getRoleLabel(
  role: StaffRole,
) {
  switch (role) {
    case "physician":
      return "Physician";

    case "receptionist":
      return "Receptionist";

    case "admin":
      return "Administrator";

    default:
      return role;
  }
}

function getDepartmentLabel(
  role: StaffRole,
) {
  switch (role) {
    case "receptionist":
      return "Front Desk";

    case "admin":
      return "Administration";

    case "physician":
      return "Medical";

    default:
      return "Clinic Operations";
  }
}

export default StaffDirectoryPage;