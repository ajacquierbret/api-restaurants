export type Position = {
    lat: number;
    lng: number;
};

export type Restaurant = {
    restaurantName: string;
    address: string;
    lat: number;
    long: number;
    ratings: {
        stars: number;
        comment: string;
    }[];
}