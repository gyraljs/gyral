export const CONTRACTS = {
  feature:
    'Implement a task list with a labeled "New task" input, "Add task" submit button, and All/Active/Completed filter buttons. Ignore blank or whitespace-only submissions; trim added text and clear the input after successful addition. Each task has a checkbox labeled with its title and a "Delete [task title]" button. Preserve insertion order and per-task identity across filters. Show an announced active task count. Adding, completing, uncompleting, deleting and filtering must work without reload. Begin empty. Use the assigned framework idiomatically.',
  bug: 'Fix the task-list bug: after adding Alpha, Beta and Gamma, complete Alpha and switch to Active. Toggling Beta currently changes the wrong task because a visible filtered position is used in the full list. The clicked task must change by stable identity. Preserve all existing behavior, including unfiltered toggles, filters, deletion, trimmed additions and active count. Begin empty. Use the assigned framework idiomatically.',
  form: 'Implement a signup form with labeled Name, Email and "I agree to the terms" controls and a "Sign up" submit button. Trim Name; require at least two characters. Email is required and must satisfy native email-input validity. Agreement is mandatory. Invalid submission must show specific field errors, mark invalid controls aria-invalid=true, associate errors using aria-describedby, announce an error summary and focus the first invalid control. Preserve values for correction. Success clears errors and announces the trimmed name and email. Mouse and Enter submission must work. No network or persistence. Use the assigned framework idiomatically.',
};

export function prompt(framework, task, assisted) {
  return `You are implementing a ${framework} application.\n${CONTRACTS[task]}\n\nOnly src/ files are writable. Dependencies, config and grading are fixed. Use list_files, read_file, write_file, read_doc and check. check runs the protected type/build/browser acceptance checks. Read the supplied official documentation as needed. ${assisted ? 'The released Gyral skill is supplied below; Gyral MCP tools are also available.' : 'Only ordinary framework documentation is available.'}\nFinish by checking your code. Do not claim a passing result without checking.`;
}

export function ordering(seed = 20261011) {
  const conditions = ['gyral-docs', 'gyral-assisted', 'react-docs', 'svelte-docs'];
  const tasks = ['feature', 'bug', 'form'];
  const runs = [];
  let value = seed >>> 0;
  const random = () => {
    value = (Math.imul(1664525, value) + 1013904223) >>> 0;
    return value / 4294967296;
  };
  for (let trial = 1; trial <= 3; trial++) {
    const block = conditions.flatMap((condition) =>
      tasks.map((task) => ({
        id: `${condition}-${task}-${trial}`,
        condition,
        framework: condition.split('-')[0],
        task,
        trial,
      })),
    );
    for (let i = block.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [block[i], block[j]] = [block[j], block[i]];
    }
    runs.push(...block);
  }
  return runs;
}
