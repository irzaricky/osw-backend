import express from "express";
import stationModule from "../../module/master-data/station.js";
import stationJobRoute from "./station_jobs.js";
import auth from "../../class/auth.class.js";

const router = express.Router();

router.get("/dd-station-type", auth.sessionChecker, async (req, res) => {
  await stationModule.getStationTypes(req, res);
});

router.get("/dropdown", auth.sessionChecker, async (req, res) => {
  await stationModule.getDropdown(req, res);
});

router.get("/download", auth.sessionChecker, async (req, res) => {
  await stationModule.download(req, res);
});

router.post("/upload", auth.sessionChecker, async (req, res) => {
  await stationModule.upload(req, res);
});

router.get("/", auth.sessionChecker, async (req, res) => {
  await stationModule.list(req, res);
});

router.post("/", auth.sessionChecker, async (req, res) => {
  await stationModule.add(req, res);
});

router.put("/:id", auth.sessionChecker, async (req, res) => {
  await stationModule.update(req, res);
});

router.delete("/:id", auth.sessionChecker, async (req, res) => {
  await stationModule.delete(req, res);
});

// Nested station-job routes: /stations/:station_id/jobs
router.use("/:station_id/jobs", stationJobRoute);

export default router;