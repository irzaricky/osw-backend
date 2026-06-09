import cron from "node-cron";
import lineCapacityModule from "../module/master-data/line-capacity.js";

export const initLineCapacityCron = () => {
    cron.schedule(
    "5 0 1 * *",
    async () => {
        const now = new Date();
        console.log(
        `[Cron][LineCapacity] Start monthly recalculation — ` +
        `${now.toISOString()}`
        );

        try {
        const result = await lineCapacityModule.cronRecalculateAll();
        console.log(
            `[Cron][LineCapacity] Done — ` +
            `${result.success_count} berhasil, ${result.fail_count} gagal ` +
            `(periode: ${result.period.year}-${String(result.period.month).padStart(2, "0")})`
        );

        if (result.fail_count > 0) {
            const failed = result.results
            .filter((r) => r.status === "error")
            .map((r) => `  - ${r.line_code}: ${r.reason}`)
            .join("\n");
            console.warn(`[Cron][LineCapacity] Lines yang gagal:\n${failed}`);
        }
        } catch (err) {
        console.error("[Cron][LineCapacity] Unexpected error:", err);
        }
    },
    {
        timezone: "Asia/Jakarta",
    }
    );

    console.log("[Cron][LineCapacity] Scheduled: tanggal 1 setiap bulan pukul 00:05 WIB");
};