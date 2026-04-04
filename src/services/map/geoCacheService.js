import { GeoCache } from "../../models/geoCache.js";
import axios from "axios";

export const getGeoCacheService = async (address) => {
    if (!address) {
        throw new Error("Address is required");
    }

    //  Normalize address (avoid duplicates)
    const normalizedAddress = address.trim().toLowerCase();

    // 1. Check cache
    const existing = await GeoCache.findOne({
        address: normalizedAddress,
    });

    if (existing) {
        return existing;
    }

    // 2. Get fresh geocode
    const geoData = await getGeoCode(address);

    // 3. Save to DB
    const geoCacheing = await GeoCache.create({
        address: normalizedAddress,
        ...geoData,
    });

    return geoCacheing;
};


export const getGeoCode = async (addressText) => {
    if (!addressText) {
        throw new Error("Address is required for geocoding");
    }

    const geoResponse = await axios.get(
        "https://maps.googleapis.com/maps/api/geocode/json",
        {
            params: {
                address: addressText,
                key: process.env.GOOGLE_MAPS_API_KEY,
            },
        }
    );

    if (
        !geoResponse.data.results ||
        geoResponse.data.results.length === 0
    ) {
        throw new Error("Invalid address. Could not geocode.");
    }

    const location = geoResponse.data.results[0].geometry.location;

    //  Return in GeoJSON format
    return {
        location: {
            type: "Point",
            coordinates: [location.lng, location.lat], //  lng first
        },
    };
};