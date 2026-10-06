/**
 * The contract with src/cli/office-run.mts (the `npm run office` supervisor),
 * which cannot import app code; requests.test.ts keeps the two in step.
 */

/** Set in the app's environment when the supervisor launched it. */
export const SUPERVISED_ENV = "DUNDER_SUPERVISED";
/** Exiting with this code asks the supervisor to start the app again. */
export const RELAUNCH_EXIT_CODE = 75;
