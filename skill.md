# Core Developer Rules & Safeguards

You must follow these strict guidelines for every single code generation task in this project to ensure safety, avoid crashes, and keep the code beginner-friendly.

### 1. Global Server-Side Handling
- All database operations, validations, and business logic must be handled strictly on the backend (e.g., Supabase RLS, Next.js Server Actions).
- Never trust the frontend to validate data or enforce business logic.

### 2. Graceful Error Handling & Security
- Every backend function or Server Action must use `try/catch` blocks.
- **Strict Rule:** Log the detailed, raw technical error to the server console using `console.error()` for debugging.
- **Frontend Protection:** Return a clean, generic, user-friendly error object to the frontend (e.g., `{ success: false, error: "An unexpected error occurred. Please try again later." }`). 
- Never expose database schemas, raw query bugs, or sensitive system details to the user interface.

### 3. Frontend Runtime Crash Prevention
- Always protect the frontend from breaking when dealing with asynchronous or real-time data.
- Use strict optional chaining (`?.`) for all deeply nested object properties coming from the database (e.g., `issue?.user?.name`).
- Always provide clean fallback default values using the OR operator (`||`) to handle potential `null` or `undefined` states gracefully (e.g., `issue?.title || "Untitled Task"`).
- Ensure components render a loading state or a safe empty state if the expected data arrays are empty or missing, rather than calling `.map()` on an undefined variable.

### 4. Zero TypeScript Compilation Errors
- Write clean, explicitly typed code.
- Avoid using implicit `any` types. If a type is unknown or dynamic, explicitly handle it or define a clean interface.
- Keep components modular and simple so that beginners can read and maintain the code without fighting advanced TypeScript configuration.




### 5.Create a clean folder structure and clean readable code
- do not put everything in one file
- do not put all the logic in the ui files, separate them and keep ui files simple, clean and readable.
- the logic should be in the backend and services folder, if its frontend logic, keep it in a separate folder and keep the component files simple, clean and readable.
- use hooks to keep the ui files simple, clean and readable.
- use services to keep the backend files simple, clean and readable.

### 6. ctx7
- use this library always when searching the codebase for a solution. do not use google search, only use ctx7 to check any updated docs for the tech stack and codebase structure and naming convension and more. i have integrated the ctx7 plugin into the dev environment, so you can use it directly.