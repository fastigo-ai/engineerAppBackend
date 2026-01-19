// repository/servicePlansRepository.js
import { Category } from "../models/categoryModal.js";  
import ServicePlans from "../models/servicePlans.js";

export const findLatest = async () => {
  // assuming only one document is used; fetch the latest by updatedAt
  return ServicePlans.findOne().sort({ updatedAt: -1 }).lean();
};

export const upsertBulk = async (plansArray) => {
  // plansArray: array of objects like { Booking: [...], Quick: [...] }
  // We'll merge into a single document: if exists, replace arrays; else create.
  const existing = await ServicePlans.findOne();
  if (existing) {
    // merge: for each plan type present in incoming, replace
    plansArray.forEach((incoming) => {
      if (incoming.Booking) existing.Booking = incoming.Booking;
      if (incoming.Quick) existing.Quick = incoming.Quick;
    });
    return existing.save();
  } else {
    // create new with combined payload
    // collapse array of partials into one object
    const merged = plansArray.reduce(
      (acc, cur) => {
        if (cur.Booking) acc.Booking = cur.Booking;
        if (cur.Quick) acc.Quick = cur.Quick;
        return acc;
      },
      { Booking: [], Quick: [] }
    );
    return ServicePlans.create(merged);
  }
};

export const bulkGetByType = async ({ type, page = 1, limit = 20 }) => {
  // type: "Booking" | "Quick" | undefined (if undefined return both)
  const doc = await ServicePlans.findOne().lean();
  if (!doc) return null;

  const slice = (arr) => {
    const start = (page - 1) * limit;
    return arr.slice(start, start + limit);
  };

  if (type === "Booking") {
    return {
      total: doc.Booking.length,
      page,
      limit,
      data: slice(doc.Booking),
    };
  } else if (type === "Quick") {
    return {
      total: doc.Quick.length,
      page,
      limit,
      data: slice(doc.Quick),
    };
  } else {
    // both
    return {
      Booking: {
        total: doc.Booking.length,
        page,
        limit,
        data: slice(doc.Booking),
      },
      Quick: {
        total: doc.Quick.length,
        page,
        limit,
        data: slice(doc.Quick),
      },
    };
  }
};

