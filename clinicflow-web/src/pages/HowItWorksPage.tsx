import WhyClinicFlow from "../dashboard/WhyClinicFlow";
import PatientJourney from "../dashboard/PatientJourney";
import PatientExperience from "../dashboard/PatientExperience";

/*
 * "How it works": what ClinicFlow does, for anyone (clinic
 * owners, new staff, curious patients). Opened from the
 * "How it works" button on the dashboard video banner and
 * from the public menu.
 */
function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <WhyClinicFlow />
      <PatientJourney />
      <PatientExperience />
    </div>
  );
}

export default HowItWorksPage;
