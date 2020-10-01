import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './scss/style.scss';
import * as _ from 'lodash';
import * as $ from 'jquery';
import * as restaurantsListJSON from '../json/restaurants.json';
import { Position, Restaurant } from './types/types';
import { createRestaurantMarker, getRestaurantAverageRating } from './utils/utils';

//// Google Maps initialization

declare global {
    interface Window { initMap: () => void }
}

const mapElement: HTMLElement = document.getElementById('map');

const options: PositionOptions = {
    enableHighAccuracy: true,
    maximumAge: 30000,
    timeout: 27000,
}
const error: PositionErrorCallback = () => console.debug("La position n'a pas pu être obtenue.");

let userPosition: Position;

const mapScript = document.createElement('script');
mapScript.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyCpx26o2E4K28ETHnFC2ufBaVjgKGVU9yo&callback=initMap';
mapScript.async = true;
mapScript.defer = true;


//// Streetview images handling

const getStreetViewImage = ({ lat, lng }: Position): HTMLImageElement => {
    const streetViewImage = new Image(300, 200);
    const request = `https://maps.googleapis.com/maps/api/streetview?size=300x200&location=${lat},${lng}&pitch=0&key=AIzaSyCpx26o2E4K28ETHnFC2ufBaVjgKGVU9yo`
    fetch(request).then((res) => {
        return res.blob();
    }).then((res) => {
        const URLobject = URL.createObjectURL(res);
        streetViewImage.src = URLobject;
    })
    return streetViewImage;
}

const restaurantsImages: {
    name: string;
    image: HTMLImageElement;
}[] = [];

restaurantsListJSON.forEach(restaurant => {
    restaurantsImages.push({
        name: restaurant.restaurantName,
        image: getStreetViewImage({ lat: restaurant.lat, lng: restaurant.long }),
    })
});



//// Filters handling

const starFilter = {
    min: 0,
    max: 5,
}

const isBetweenFilters = (rating?: number) => {
    return rating >= starFilter.min && rating <= starFilter.max
}


//// Restaurants list and ratings

const ratingsListElement: JQuery<HTMLElement> = $('#ratings');
const restaurantsListElement: JQuery<HTMLElement> = $('#restaurants');
const restaurantItemClass = 'list-group-item ' + 'list-group-item-action ' + 'flex-column ' + 'align-items-start';

const resetDOMElements = () => {
    restaurantsListElement.empty();
    ratingsListElement.empty()
}

const fillRestaurantsLists = (restaurants: Restaurant[]) => {
    restaurants.forEach(restaurant => {
        restaurantsListElement.append(`
            <a href="#${restaurant.restaurantName}-tab" class="restaurant-item ${restaurantItemClass}" id="${restaurant.restaurantName}-list" data-toggle="list" role="tab">
                <div class="d-flex w-100 justify-content-between">
                    <h5 class="mb-1">${restaurant.restaurantName}</h5>
                    <small>${getRestaurantAverageRating(restaurant.ratings)} / 5</small>
                </div>
                <small>${restaurant.address}</small>
            </a>
        `)
        ratingsListElement.append(`
            <div class="tab-pane fade show" role="tabpanel" aria-labelledby="${restaurant.restaurantName}-list" id="${restaurant.restaurantName}-tab"></div>
        `)
        $(`#${restaurant.restaurantName}-tab`).append(restaurantsImages.find(el => el.name === restaurant.restaurantName).image)
        restaurant.ratings.forEach(rating => {
            $(`#${restaurant.restaurantName}-tab`).append(`
                <div class="w-100 mt-5 justify-content-between">
                    <h5>${rating.stars} / 5</h5>
                    <p class="text-muted">${rating.comment}</p>
                </div>
            `)
        })
    })
}

const findNearestRestaurants = (restaurants: Restaurant[], map: google.maps.Map<Element>) => {
    return restaurants.filter(restaurant => map.getBounds().contains({
        lat: restaurant.lat,
        lng: restaurant.long,
    }) && isBetweenFilters(getRestaurantAverageRating(restaurant.ratings)))
}

window.initMap = (): void => {
    if (navigator.geolocation) {

        let googleMap: google.maps.Map;

        const mapOptions: google.maps.MapOptions = {
            zoom: 15,
        }
        
        const userPositionDot = new google.maps.Marker({
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillOpacity: 1,
                strokeWeight: 2,
                fillColor: '#5384ED',
                strokeColor: '#FFFFFF',
            }
        });

        let nearestRestaurants: Restaurant[];
        let restaurantsMarkers: google.maps.Marker[] = [];

        const clearMarkers = (markers: google.maps.Marker[]) => {
            markers.forEach(marker => {
                marker.setMap(null)
            });
            markers = [];
        };

        // Put restaurants on map
        const fillRestaurantsMarkers = (restaurants: Restaurant[]) => {
            clearMarkers(restaurantsMarkers);
            restaurants.forEach(restaurant => {
                const marker = createRestaurantMarker({
                    lat: restaurant.lat,
                    lng: restaurant.long,
                });
                restaurantsMarkers.push(marker)
                marker.addListener('click', () => {
                    $(`#${restaurant.restaurantName}-list`).tab('show')
                });
            });
            restaurantsMarkers.forEach(marker => {
                marker.setMap(googleMap)
            });
        };

        const updateRestaurants = () => {
            resetDOMElements();
            nearestRestaurants = findNearestRestaurants(
                restaurantsListJSON as Restaurant[],
                googleMap,
            );
            fillRestaurantsLists(nearestRestaurants);
            fillRestaurantsMarkers(nearestRestaurants);
        };

        navigator.geolocation.watchPosition((position) => {
            // Put user on the map
            userPosition = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            };
            googleMap = new google.maps.Map(mapElement, {
                center: userPosition,
                ...mapOptions,
            });
            userPositionDot.setMap(googleMap);
            userPositionDot.setPosition(userPosition);

            // Listen to bounds changes
            googleMap.addListener('bounds_changed', () => {
                updateRestaurants()
            });

            // Listen to filters change
            $('#min-stars').on('change', () => {
                starFilter.min = $('#min-stars').val() as number;
                updateRestaurants();
            });
            $('#max-stars').on('change', () => {
                starFilter.max = $('#max-stars').val() as number;
                updateRestaurants();
            });
        }, error, options);
  };
}

// Main initialization
document.head.appendChild(mapScript);