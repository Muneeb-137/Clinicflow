import type { Variants } from "motion/react";

export const whyClinicFlowAnimation: Variants = {
  hidden: {
    opacity: 0,
    y: 90,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.14,
    },
  },
};

export const whyClinicFlowCardAnimation: Variants = {
  hidden: {
    opacity: 0,
    y: 55,
    filter: "blur(8px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export const headingAnimation: Variants = {
  hidden: {
    opacity: 0,
    y: 220,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 1.8,
      ease: "linear",
    },
  },
};

export const waitPanelAnimation: Variants = {
  hidden: {
    opacity: 0,
    y: 360,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 2.4,
      delay: 0.25,
      ease: "linear",
    },
  },
};

export const roomPanelAnimation: Variants = {
  hidden: {
    opacity: 0,
    y: 360,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 2.4,
      delay: 0.55,
      ease: "linear",
    },
  },
};

export const itemAnimation: Variants = {
  hidden: {
    opacity: 0,
    y: 85,
  },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 1.25,
      delay,
      ease: "linear",
    },
  }),
};

export const journeyHeadingAnimation: Variants = {
  hidden: {
    opacity: 0,
    y: 180,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 2.4,
      ease: "linear",
    },
  },
};

export const journeyLineAnimation: Variants = {
  hidden: {
    scaleY: 0,
  },
  visible: {
    scaleY: 1,
    transition: {
      duration: 5.5,
      delay: 0.45,
      ease: "linear",
    },
  },
};

export const journeyCardAnimation: Variants = {
  hidden: (index: number) => ({
    opacity: 0,
    y: 220,
    x: index % 2 === 0 ? -100 : 100,
  }),
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    x: 0,
    transition: {
      duration: 1.5,
      delay: 0.6 + index * 0.45,
      ease: "linear",
    },
  }),
};

export const journeyNodeAnimation: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.25,
  },
  visible: (index: number) => ({
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.65,
      delay: 0.9 + index * 0.45,
      type: "spring",
      stiffness: 90,
      damping: 16,
    },
  }),
};