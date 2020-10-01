import { Position, Restaurant } from '../types/types';

declare global {
    interface Window { initMap: () => void }
}

//// RESTAURANTS UTILS

export const createRestaurantMarker = (position: Position, fillColor: string) => new google.maps.Marker({
    clickable: true,
    position: position,
    icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillOpacity: 1,
        strokeWeight: 2,
        fillColor,
        strokeColor: '#FFFFFF',
    },
})

export const getRestaurantAverageRating = (ratings: {
    stars: number;
    comment: string;
}[]) => {
    const stars = ratings.map(rating => rating.stars);
    if (stars.length) return Number((stars.reduce((a, b) => a + b) / stars.length).toFixed(1));
    else return 0;
}
