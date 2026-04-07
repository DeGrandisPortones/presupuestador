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

export async function saveMeasurementDetailed(id, {
  form,
  submit = false,
  returnToSeller = false,
  returnReason = "",
  endCustomer = null,
  baselineForm = null,
} = {}) {
  const res = await http.put(`/api/measurements/${id}`, {
    form,
    submit,
    return_to_seller: returnToSeller,
    return_reason: returnReason,
    end_customer: endCustomer,
    baseline_form: baselineForm,
  });
  return res.data;
}

export async function saveMeasurement(id, { form, submit = false, returnToSeller = false, returnReason = "", endCustomer = null, baselineForm = null } = {}) {
  const data = await saveMeasurementDetailed(id, { form, submit, returnToSeller, returnReason, endCustomer, baselineForm });
  return data?.quote || null;
}

export async function scheduleMeasurement(id, { scheduledFor } = {}) {
  const res = await http.put(`/api/measurements/${id}/schedule`, { scheduled_for: scheduledFor });
  return res.data?.quote;
}

export async function reviewMeasurement(id, { action, notes } = {}) {
  const res = await http.post(`/api/measurements/${id}/review`, { action, notes });
  return res.data;
}

export async function resetReturnedMeasurementQuote(id) {
  const res = await http.post(`/api/measurements/${id}/return/reset`, {});
  return res.data;
}

export async function confirmReturnedMeasurementQuote(id) {
  const res = await http.post(`/api/measurements/${id}/return/confirm`, {});
  return res.data;
}
