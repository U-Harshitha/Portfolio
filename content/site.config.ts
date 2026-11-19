// ─────────────────────────────────────────────────────────────
//  The one file that controls the whole site.
//  Change a value, save, and the site rebuilds. No layout code needed.
// ─────────────────────────────────────────────────────────────

const site = {
  name: 'Harshitha Upadhyayula',
  shortName: 'Harshitha',
  // Shown under your name. Draft written from your brief, rewrite freely.
  tagline: 'I take things apart to see how they work, then build them again.',
  role: 'Software engineer, Google Cloud VMware Engine networking',
  description:
    'Harshitha Upadhyayula: software engineer on Google Cloud VMware Engine networking. Take her laptop apart to find her work, projects, tech videos, dance and reading.',

  // The "Now" tag. Change this whenever your focus changes.
  now: {
    text: 'Learning GCVE networking from the inside, one packet at a time.',
    updated: '2026-11',
  },

  // Light or dark when a visitor has no saved preference: 'system' | 'light' | 'dark'
  defaultTheme: 'light' as 'system' | 'light' | 'dark',

  // The order parts are listed in, and the order the "next part" button follows.
  // Ids match the file names in content/parts/. Remove one to hide that room.
  partsOrder: ['screen', 'cpu', 'ssd', 'gpu', 'speakers', 'ram', 'battery', 'keyboard', 'wifi', 'trackpad'],

  links: {
    linkedin: 'https://www.linkedin.com/in/harshitha-upadhyayula',
    github: 'https://github.com/U-Harshitha', // from your resume
    instagram: '', // TODO(harshitha): your dance Instagram URL
    youtube: '', // TODO(harshitha): channel URL once it launches
    email: '', // TODO(harshitha): public contact email
    // NOTE: public/resume.pdf currently includes your phone number. Swap in a public version before deploying.
    resume: '/resume.pdf',
  },
};

export default site;
