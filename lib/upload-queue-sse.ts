/**
 * Stream progress updates as Server-Sent Events for upload-queue batch processing.
 */
export function createProgressStream(
  callback: (send: (data: unknown) => void) => Promise<void>,
): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        await callback(send);
        send({ type: "complete" });
      } catch (error: unknown) {
        const err = error as { message?: string };
        send({
          type: "error",
          error: err?.message || "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });
}
