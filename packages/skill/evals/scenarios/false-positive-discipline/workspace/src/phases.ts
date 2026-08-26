interface Job {
  id: string;
  run: () => void;
}

const queue: Job[] = [];

export function schedulePhase(job: Job) {
  queue.push(job);
  setTimeout(() => {
    const position = queue.indexOf(job);
    if (position === 0) {
      job.run();
      queue.shift();
    }
  }, 1000);
}
