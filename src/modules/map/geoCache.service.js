import { GeoCache } from "./GeoCache.model.js";
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

export const getReverseGeoCache = async (lat, lng) => {
    if (!lat || !lng) {
        throw new Error("Latitude and longitude are required");
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    // 1. Check if we have a cached address within a very small radius (10 meters)
    // This handles slight variations in GPS coordinates for the same location
    const existing = await GeoCache.findOne({
        location: {
            $near: {
                $geometry: {
                    type: "Point",
                    coordinates: [longitude, latitude],
                },
                $maxDistance: 10, // 10 meters
            },
        },
    });

    if (existing) {
        console.log(`[GeoCache] Hit for reverse geocode at ${lat}, ${lng} -> ${existing.address}`);
        return existing.address;
    }

    // 2. Get fresh address from Google
    console.log(`[GeoCache] Miss for reverse geocode at ${lat}, ${lng}. Fetching from Google...`);
    const response = await axios.get(
        "https://maps.googleapis.com/maps/api/geocode/json",
        {
            params: {
                latlng: `${latitude},${longitude}`,
                key: process.env.GOOGLE_MAPS_API_KEY,
            },
        }
    );

    if (response.data.status !== "OK" || response.data.results.length === 0) {
        throw new Error("Could not find address for these coordinates");
    }

    const address = response.data.results[0].formatted_address;

    // 3. Save to Cache
    await GeoCache.create({
        address: address.trim().toLowerCase(),
        location: {
            type: "Point",
            coordinates: [longitude, latitude],
        },
    });

    return address;
};