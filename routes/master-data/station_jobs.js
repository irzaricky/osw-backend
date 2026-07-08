import express from "express";
import stationJobModule from "../../module/master-data/station_job.js";
import auth from "../../class/auth.class.js";

// mergeParams: true agar :station_id dari parent route (station.route.js) tersedia di req.params
const router = express.Router({ mergeParams: true });

router.get("/", auth.sessionChecker, async (req, res) => {
  await stationJobModule.list(req, res);
});

router.post("/", auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
  await stationJobModule.add(req, res);
});

router.put("/:id", auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
  await stationJobModule.update(req, res);
});

router.delete("/:id", auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
  await stationJobModule.delete(req, res);
});

export default router;
