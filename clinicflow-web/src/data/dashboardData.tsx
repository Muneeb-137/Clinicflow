import {
  BellRing,
  CalendarClock,
  CalendarDays,
  CircleCheckBig,
  ClipboardCheck,
  DoorOpen,
  FileWarning,
  MapPin,
  Stethoscope,
  Users,
} from "lucide-react";

export const patientProblems = [
  {
    icon: CalendarClock,
    title: "Appointment times are not live wait times",
    description:
      "Patients arrive for a scheduled time but still have no idea when they will actually be called.",
  },
  {
    icon: MapPin,
    title: "Patients cannot see their real position",
    description:
      "Most systems show an estimate instead of showing meaningful progress through the clinic queue.",
  },
  {
    icon: BellRing,
    title: "Delay updates arrive too late",
    description:
      "Patients often learn about delays only after they have arrived and entered a crowded waiting room.",
  },
];

export const clinicProblems = [
  {
    icon: Users,
    title: "Staff manage information across separate screens",
    description:
      "Queue status, room availability, appointments, and patient readiness are often disconnected.",
  },
  {
    icon: Stethoscope,
    title: "Doctors may not know who is fully ready next",
    description:
      "A patient may be waiting while forms, rooms, or visit information are still incomplete.",
  },
  {
    icon: FileWarning,
    title: "Small handoff problems create large delays",
    description:
      "Missing intake forms, unassigned rooms, and delayed status updates interrupt the entire patient flow.",
  },
];

export const patientJourneySteps = [
  {
    title: "Book Appointment",
    description: "Schedule online or contact the clinic.",
    icon: CalendarDays,
  },
  {
    title: "Check In",
    description: "Check in with reception, mobile, or QR.",
    icon: ClipboardCheck,
  },
  {
    title: "Join Live Queue",
    description: "Receive accurate wait-time updates.",
    icon: Users,
  },
  {
    title: "Doctor Assigned",
    description: "The appropriate doctor is notified.",
    icon: Stethoscope,
  },
  {
    title: "Room Ready",
    description: "The patient is directed to an available room.",
    icon: DoorOpen,
  },
  {
    title: "Visit Complete",
    description: "The consultation is completed and recorded.",
    icon: CircleCheckBig,
  },
];
