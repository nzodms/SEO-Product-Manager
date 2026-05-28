import { z } from "zod";
import ExcelJS from "exceljs";
import {
  analyzeMatrixifyCollections,
  buildCorrectedCollections,
} from "@/lib/migration/matrixifyCollections";

export const runtime = "nodejs";

const Body = z.object({
  collectionsCsv: z.string().min(1),
  handleMap: z.record(z.string(), z.string()),
});

// Same corrected Matrixify dataset as the CSV export, emitted as a real XLSX
// workbook. Sheet name "Custom Collections" is what Matrixify expects on import.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "collectionsCsv et handleMap requis" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { collections } = analyzeMatrixifyCollections(parsed.data.collectionsCsv);
    const { headers, rows } = buildCorrectedCollections(collections, parsed.data.handleMap);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Custom Collections");
    ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.min(40, Math.max(14, h.length + 2)) }));
    for (const r of rows) ws.addRow(r);
    ws.getRow(1).font = { bold: true };

    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="collections-matrixify-corrige.xlsx"`,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Export XLSX échoué" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
