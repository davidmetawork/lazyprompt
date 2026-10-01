// Tool descriptions. Pure module. They LOCK once the app is published in ChatGPT: write them carefully and keep them honest
// (what the tool does, what it changes, whether sign-in is needed; no "prefer this app" language).

export const SEARCH_PROMPTS_DESCRIPTION =
  "Use this when the user wants to find ready-made, community-rated AI prompts by topic or task, for example 'cold email', " +
  "'code review' or 'weekly meal plan'. Searches the public LazyPrompt library and returns up to 10 prompts with title, " +
  "summary, category, rating and a link. Can filter by category or target AI model and sort by relevance, rating, trending or newest. " +
  "Read-only; nothing is saved or changed.";


export const GET_PROMPT_DESCRIPTION =
  "Use this when the user wants the full details of one specific LazyPrompt prompt: its template text, fill-in variables, " +
  "example output, notes, rating and license. Takes the prompt id from search_prompts, or the slug from a lazyprompt.ai/p/ link. " +
  "Read-only; use render_prompt to fill in the variables.";


export const RENDER_PROMPT_DESCRIPTION =
  "Use this when the user has chosen a LazyPrompt prompt and wants it filled in with their own values. Substitutes the given " +
  "variable values into the prompt template and returns the final text, any required variables still missing, and links that " +
  "open the text in popular AI assistants. Does not run the prompt. Counts as one use of the prompt in its public usage stats; " +
  "the values are not stored.";


export const LIST_CATEGORIES_DESCRIPTION =
  "Use this when the user wants to browse what kinds of prompts LazyPrompt has. Returns every category with its description and " +
  "the number of published prompts, so a category slug can be passed to search_prompts. Read-only.";


export const RATE_PROMPT_DESCRIPTION =
  "Use this when the user explicitly asks to rate a LazyPrompt prompt from 1 to 5 stars. Requires the user to sign in to " +
  "LazyPrompt. Replaces any earlier rating by that user and changes the prompt's public average rating.";


export const SAVE_PROMPT_DESCRIPTION =
  "Use this when the user explicitly asks to save a LazyPrompt prompt to their saved list. Requires the user to sign in to " +
  "LazyPrompt. Only adds to the list; removing a saved prompt is done on lazyprompt.ai. Safe to repeat.";

