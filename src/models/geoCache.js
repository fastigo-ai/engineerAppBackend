import mongoose from "mongoose";

const geoCacheSchema = new mongoose.Schema({
    address: {
        type: String,
        required: true,
        trim: true,
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            required: true
        },
        coordinates: {
            type: [Number],
            required: true
        }
    },

})

geoCacheSchema.index({ location: "2dsphere" });
geoCacheSchema.index({ address: 1 });

export const GeoCache = mongoose.model('GeoCache', geoCacheSchema);