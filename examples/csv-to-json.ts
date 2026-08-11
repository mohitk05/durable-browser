import { createWorkflow } from "../src/index.js";

const parseCSV = (csvContent: string) => {
  const rows = csvContent.split("\n").map((line) => line.split(","));
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers?.forEach((header, index) => {
      record[header] = row[index] || "";
    });
    // Simple validation: Check if all fields are non-empty
    const isValid = Object.values(record).every((value) => value.trim() !== "");
    return { ...record, isValid };
  });
};

export const csvToJsonWorkflow = createWorkflow(
  "csv-to-json-1",
  async (ctx) => {
    // Step 1: Pause execution until the user picks a file in the UI
    const { fileContent, fileName } = await ctx.onEvent<{
      fileContent: string;
      fileName: string;
    }>("file-selected");

    // Step 2: Parse and validate file contents locally
    const validRecords = await ctx.step(async () => {
      const rawRows = parseCSV(fileContent);
      return rawRows.filter((row) => row.isValid);
    });

    // Step 3: Durable delay using context method
    await ctx.sleep("1h");

    // Step 4: Write the parsed records as a JSON file to the browser's local file system (OPFS)
    const savedFileInfo = await ctx.step(async () => {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(`parsed_${fileName}.json`, {
        create: true,
      });

      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(validRecords, null, 2));
      await writable.close();

      return { filePath: fileHandle.name, savedAt: Date.now() };
    });

    console.log(
      `Successfully saved parsed records to ${savedFileInfo.filePath} at ${new Date(savedFileInfo.savedAt).toISOString()}`,
    );
  },
);
