import express from "express";
import auth from "../../class/auth.class.js";
import uomModule from "../../module/master-data/uom.js";

const router = express.Router();

router.get("/dropdown", auth.sessionChecker, async (req, res) => {
  await uomModule.dropdown(req, res);
});

router.get("/", auth.sessionChecker, async (req, res) => {
  await uomModule.list(req, res);
});

router.post("/", auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
  await uomModule.add(req, res);
});

router.put("/:id", auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
  await uomModule.update(req, res);
});

router.delete("/:id", auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
  await uomModule.delete(req, res);
});

export default router;