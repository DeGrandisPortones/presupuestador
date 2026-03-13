import { http } from "./http";

export async function listMeasurements({
  status = "pending",
  q = "",
  customer = "",
  locality = "",
  dateFrom = "",
  dateTo = "",
  viewer = "medidor",
} = {}) {
  const res = await http.get("/api/measurements", {
    params: {
      status,
      q,
      customer: customer || q,
      locality,
      date_from: dateFrom,
      date_to: dateTo,
      viewer,
    },
  });
  return res.data?.quotes || [];
}

export async function getMeasurement(id) {
  const res = await http.get(`/api/measurements/${id}`);
  return res.data?.quote;
}

export async function saveMeasurement(id, { form, submit = false, endCustomer = null } = {}) {
  const res = await http.put(`/api/measurements/${id}`, { form, submit, end_customer: endCustomer });
  return res.data?.quote;
}

export async function scheduleMeasurement(id, { scheduledFor } = {}) {
  const res = await http.put(`/api/measurements/${id}/schedule`, { scheduled_for: scheduledFor });
  return res.data?.quote;
}

export async function reviewMeasurement(id, { action, notes } = {}) {
  const res = await http.post(`/api/measurements/${id}/review`, { action, notes });
  return res.data?.quote;
}
