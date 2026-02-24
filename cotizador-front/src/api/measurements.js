import { http } from "./http";

export async function listMeasurements({ status = "pending", q = "" } = {}) {
  const res = await http.get("/api/measurements", { params: { status, q } });
  return res.data?.quotes || [];
}

export async function getMeasurement(id) {
  const res = await http.get(`/api/measurements/${id}`);
  return res.data?.quote;
}

export async function saveMeasurement(id, { form, submit = false } = {}) {
  const res = await http.put(`/api/measurements/${id}`, { form, submit });
  return res.data?.quote;
}

export async function reviewMeasurement(id, { action, notes } = {}) {
  const res = await http.post(`/api/measurements/${id}/review`, { action, notes });
  return res.data?.quote;
}

