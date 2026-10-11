import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarCheck2,
  ChevronDown,
  CircleHelp,
  HeartPulse,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

type FaqCategory =
  | "Getting Started"
  | "Appointments & Queue"
  | "Patient Records"
  | "General";

type FaqItem = {
  id: number;
  category: FaqCategory;
  question: string;
  answer: string;
};

const faqItems: FaqItem[] = [
  {
    id: 1,
    category: "Getting Started",
    question: "What is ClinicFlow?",
    answer:
      "ClinicFlow is a modern clinic management platform designed to simplify appointment scheduling, organize patient flow, reduce wait times, and help clinic staff manage daily operations more efficiently.",
  },
  {
    id: 2,
    category: "Getting Started",
    question: "Who is ClinicFlow designed for?",
    answer:
      "ClinicFlow is designed for family medicine clinics, walk-in clinics, multidisciplinary practices, reception teams, physicians, and healthcare administrators looking to modernize clinic operations.",
  },
  {
    id: 3,
    category: "Getting Started",
    question: "Can patients book appointments online?",
    answer:
      "Yes. Patients can book available appointment times online while the clinic maintains control over physician schedules, blocked time, availability, and appointment capacity.",
  },
  {
    id: 4,
    category: "Getting Started",
    question: "Can clinic staff still book appointments for patients?",
    answer:
      "Yes. Staff can create appointments through ClinicFlow when a patient calls the clinic or requests an appointment in person.",
  },
  {
    id: 5,
    category: "Getting Started",
    question: "Does ClinicFlow support same-day appointments?",
    answer:
      "Yes. Patients or clinic staff can reserve an available appointment for the same day. A same-day reservation is still considered a scheduled appointment because the time was reserved before arrival.",
  },
  {
    id: 6,
    category: "Appointments & Queue",
    question: "How does the Live Queue work?",
    answer:
      "The Live Queue follows the patient through a clear workflow: Scheduled, Checked In, Roomed, and Completed. This gives clinic staff a real-time overview of patient arrivals and current clinic activity.",
  },
  {
    id: 7,
    category: "Appointments & Queue",
    question: "Can walk-in patients be accommodated?",
    answer:
      "Yes. Staff can register a walk-in patient, select an available same-day appointment time, and add the patient directly to the waiting queue after arrival.",
  },
  {
    id: 8,
    category: "Appointments & Queue",
    question:
      "Can patients see a physician other than their primary care provider?",
    answer:
      "Yes. If a patient's primary provider is unavailable, the patient can be booked with another available physician. ClinicFlow can identify that physician as an alternate provider while retaining the patient's existing clinic history.",
  },
  {
    id: 9,
    category: "Appointments & Queue",
    question: "Does ClinicFlow estimate patient wait times?",
    answer:
      "Yes. ClinicFlow uses check-in and rooming timestamps to provide current queue information, average completed wait times, and the longest active wait.",
  },
  {
    id: 10,
    category: "Appointments & Queue",
    question: "Can appointments be cancelled or rescheduled?",
    answer:
      "Clinic staff can update appointment information and cancel appointments when necessary. Rescheduling can be handled by selecting another available appointment time.",
  },
  {
    id: 11,
    category: "Patient Records",
    question: "Do patients need a primary care provider?",
    answer:
      "No. Patients can be registered without a primary care provider. These patients can still receive care, book appointments, and maintain a patient record at the clinic.",
  },
  {
    id: 12,
    category: "Patient Records",
    question: "Can a primary care provider be assigned later?",
    answer:
      "Yes. A patient's primary care provider is optional and can be assigned or changed later without creating a new patient record.",
  },
  {
    id: 13,
    category: "Patient Records",
    question: "What happens when a patient sees another physician?",
    answer:
      "ClinicFlow can identify the appointment as being with an alternate provider. This gives the physician useful context and allows them to review the patient's existing clinic chart and previous history.",
  },
  {
    id: 14,
    category: "Patient Records",
    question: "How is patient information protected?",
    answer:
      "ClinicFlow is being designed with privacy, controlled access, secure data handling, and healthcare-focused workflows in mind. Specific privacy and compliance claims should be confirmed before public release.",
  },
  {
    id: 15,
    category: "Patient Records",
    question: "Can returning patients be booked more quickly?",
    answer:
      "Yes. Returning patients can be selected from the clinic's existing patient list, reducing the need to enter the same registration information again.",
  },
  {
    id: 16,
    category: "General",
    question: "Can ClinicFlow support multiple physicians?",
    answer:
      "Yes. ClinicFlow supports separate physician schedules, appointment availability, calendar views, patient queues, and daily clinic activity for multiple providers.",
  },
  {
    id: 17,
    category: "General",
    question: "Can clinics customize appointment types?",
    answer:
      "Yes. Clinics can configure appointment types such as general consultations, follow-ups, annual physicals, and other clinic-specific services.",
  },
  {
    id: 18,
    category: "General",
    question: "Will more features be added?",
    answer:
      "Yes. ClinicFlow can continue evolving based on clinic feedback, operational needs, and future features such as notifications, reporting, integrations, and patient-facing tools.",
  },
  {
    id: 19,
    category: "General",
    question:
      "Why choose ClinicFlow over traditional clinic scheduling systems?",
    answer:
      "ClinicFlow brings scheduling, patient registration, provider availability, live queue management, and patient flow tracking together in one modern and approachable platform.",
  },
];

const categoryDetails: Record<
  FaqCategory,
  {
    description: string;
    icon: typeof CircleHelp;
  }
> = {
  "Getting Started": {
    description: "Learn the basics of using ClinicFlow.",
    icon: HeartPulse,
  },
  "Appointments & Queue": {
    description: "Understand scheduling and live patient flow.",
    icon: CalendarCheck2,
  },
  "Patient Records": {
    description: "Learn how patient profiles and providers work.",
    icon: UsersRound,
  },
  General: {
    description: "Common questions about the ClinicFlow platform.",
    icon: ShieldCheck,
  },
};

const categories = Object.keys(
  categoryDetails,
) as FaqCategory[];

function FaqPage() {
  const [openQuestionId, setOpenQuestionId] =
    useState<number | null>(1);

  const [selectedCategory, setSelectedCategory] =
    useState<FaqCategory | "All">("All");

  const [searchTerm, setSearchTerm] = useState("");

  const filteredQuestions = useMemo(() => {
    const normalizedSearch =
      searchTerm.trim().toLowerCase();

    return faqItems.filter((item) => {
      const matchesCategory =
        selectedCategory === "All" ||
        item.category === selectedCategory;

      const matchesSearch =
        !normalizedSearch ||
        item.question
          .toLowerCase()
          .includes(normalizedSearch) ||
        item.answer
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [searchTerm, selectedCategory]);

  function toggleQuestion(questionId: number) {
    setOpenQuestionId((currentId) =>
      currentId === questionId ? null : questionId,
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-8">
      <div className="relative overflow-hidden rounded-[28px] border border-[#13B2B3]/15 bg-gradient-to-br from-slate-950 via-slate-900 to-[#0c5059] px-6 py-10 text-white shadow-xl sm:px-10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#13B2B3]/20 blur-3xl" />

        <div className="relative max-w-3xl">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-[#5ee5df] ring-1 ring-white/10">
            <CircleHelp size={25} />
          </div>

          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#5ee5df]">
            Help and information
          </p>

          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Frequently Asked Questions
          </h1>

          <p className="mt-4 max-w-2xl leading-7 text-slate-300">
            Find answers about appointments, walk-in
            patients, provider assignments, patient records,
            and ClinicFlow&apos;s live queue.
          </p>

          <div className="mt-7 flex max-w-xl items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
            <Search
              size={19}
              className="shrink-0 text-[#5ee5df]"
            />

            <input
              type="search"
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(event.target.value)
              }
              placeholder="Search frequently asked questions"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <CategoryButton
          label="All Questions"
          isActive={selectedCategory === "All"}
          onClick={() => setSelectedCategory("All")}
        />

        {categories.map((category) => (
          <CategoryButton
            key={category}
            label={category}
            isActive={selectedCategory === category}
            onClick={() =>
              setSelectedCategory(category)
            }
          />
        ))}
      </div>

      {filteredQuestions.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#13B2B3]/10 text-[#13B2B3]">
            <Search size={25} />
          </div>

          <h2 className="mt-4 text-lg font-bold text-slate-900">
            No matching questions
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Try using another search term or selecting a
            different category.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {categories.map((category) => {
            const categoryQuestions =
              filteredQuestions.filter(
                (item) => item.category === category,
              );

            if (categoryQuestions.length === 0) {
              return null;
            }

            const CategoryIcon =
              categoryDetails[category].icon;

            return (
              <motion.section
                key={category}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#13B2B3]/10 text-[#13B2B3]">
                    <CategoryIcon size={20} />
                  </div>

                  <div>
                    <h2 className="font-bold text-slate-950">
                      {category}
                    </h2>

                    <p className="mt-0.5 text-sm text-slate-500">
                      {
                        categoryDetails[category]
                          .description
                      }
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {categoryQuestions.map((item) => {
                    const isOpen =
                      openQuestionId === item.id;

                    return (
                      <motion.article
                        key={item.id}
                        layout
                        className={`overflow-hidden rounded-2xl border bg-white transition-shadow duration-300 ${
                          isOpen
                            ? "border-[#13B2B3]/40 shadow-lg shadow-[#13B2B3]/5"
                            : "border-slate-200 shadow-sm hover:border-[#13B2B3]/25 hover:shadow-md"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            toggleQuestion(item.id)
                          }
                          aria-expanded={isOpen}
                          className="flex w-full items-center justify-between gap-5 px-5 py-5 text-left sm:px-6"
                        >
                          <span className="font-semibold leading-6 text-slate-900">
                            {item.question}
                          </span>

                          <motion.span
                            animate={{
                              rotate: isOpen ? 180 : 0,
                              scale: isOpen ? 1.08 : 1,
                            }}
                            transition={{
                              duration: 0.25,
                            }}
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                              isOpen
                                ? "bg-[#13B2B3] text-white"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            <ChevronDown size={18} />
                          </motion.span>
                        </button>

                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              key="answer"
                              initial={{
                                height: 0,
                                opacity: 0,
                              }}
                              animate={{
                                height: "auto",
                                opacity: 1,
                              }}
                              exit={{
                                height: 0,
                                opacity: 0,
                              }}
                              transition={{
                                height: {
                                  duration: 0.32,
                                },
                                opacity: {
                                  duration: 0.22,
                                },
                              }}
                            >
                              <motion.div
                                initial={{
                                  y: -10,
                                  scale: 0.985,
                                }}
                                animate={{
                                  y: 0,
                                  scale: 1,
                                }}
                                exit={{
                                  y: -6,
                                  scale: 0.99,
                                }}
                                transition={{
                                  duration: 0.25,
                                }}
                                className="border-t border-slate-100 px-5 pb-6 pt-5 sm:px-6"
                              >
                                <div className="relative rounded-2xl border border-[#13B2B3]/15 bg-[#F5FCFD] px-5 py-4">
                                  <div className="absolute bottom-3 left-0 top-3 w-1 rounded-r-full bg-[#13B2B3]" />

                                  <p className="pl-2 leading-7 text-slate-600">
                                    {item.answer}
                                  </p>
                                </div>
                              </motion.div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.article>
                    );
                  })}
                </div>
              </motion.section>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-3xl border border-[#13B2B3]/20 bg-gradient-to-r from-[#F4FCFC] to-white px-6 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <h2 className="text-lg font-bold text-slate-950">
            Still have a question?
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Contact ClinicFlow and let us know how we can
            help.
          </p>
        </div>

        <a
          href="/contact"
          className="inline-flex w-fit items-center justify-center rounded-xl bg-[#13B2B3] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#109a9b]"
        >
          Contact Us
        </a>
      </div>
    </section>
  );
}

type CategoryButtonProps = {
  label: string;
  isActive: boolean;
  onClick: () => void;
};

function CategoryButton({
  label,
  isActive,
  onClick,
}: CategoryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
        isActive
          ? "border-[#13B2B3] bg-[#13B2B3] text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-600 hover:border-[#13B2B3]/40 hover:text-[#13B2B3]"
      }`}
    >
      {label}
    </button>
  );
}

export default FaqPage;