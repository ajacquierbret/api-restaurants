import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './scss/style.scss';
import * as _ from 'lodash';
import * as $ from 'jquery';
import * as restaurantsListJSON from '../json/restaurants.json';
import { Position, Restaurant } from './types/types';
import { createRestaurantMarker, getRestaurantAverageRating } from './utils/utils';

let localRestaurantsList = restaurantsListJSON;

//// Google Maps initialization

$('#main-infos').height(window.innerHeight);
$('#restaurants').height(window.innerHeight);

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
mapScript.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyCpx26o2E4K28ETHnFC2ufBaVjgKGVU9yo&libraries=geometry,places&callback=initMap';
mapScript.async = true;
mapScript.defer = true;


//// Streetview images handling

const getStreetViewImage = ({ lat, lng }: Position): HTMLImageElement => {
    const streetViewImage = new Image();
    streetViewImage.classList.add('img-fluid')
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

const initRestaurantsImages = () => {
    localRestaurantsList.forEach(restaurant => {
        const restaurantName = restaurant.restaurantName.replace(' ', '-').replace("'", '').toLowerCase();
        restaurantsImages.push({
            name: restaurantName,
            image: getStreetViewImage({ lat: restaurant.lat, lng: restaurant.long }),
        })
    });
}

initRestaurantsImages();

const userRatingStringLiteral = (idSuffix: string) => `
<div class="form-group mt-5" id="rating-form-${idSuffix}">
  <div class="input-group mb-3">
    <input class="form-control" min="0" max="5" type="number" placeholder="Ma note" />
    <div class="input-group-append">
      <span class="input-group-text">/5</span>
    </div>
  </div>
  <textarea class="form-control" type="text" placeholder="Mon avis"></textarea>
</div>
<button id="add-rating-button-${idSuffix}" class="btn btn-primary my-3">Noter</button>
`;

const placeholderListStringLiteral = `
<span class="text-muted text-center w-75 m-auto">Déplacez la carte pour afficher les restaurants proches de chez vous.</span>
`;



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

const resetDOMElements = (empty?: boolean) => {
    restaurantsListElement.empty();
    ratingsListElement.empty()
    if (empty) {
        $('#restaurants').height(window.innerHeight);
        restaurantsListElement.append(placeholderListStringLiteral)
    } else {
        $('#restaurants').height('100%');
    }
}

const fillRestaurantsLists = (restaurants: Restaurant[]) => {
    restaurants.forEach(restaurant => {
        const restaurantName = restaurant.restaurantName.slice(0, 10).replace(/ |'|&|,|.|:/g, '-').replace(/à|À/g, 'a').replace(/é|É/g, 'e').replace(/ù/g, 'u').replace(/ê|â|ô|û|î/g, '').toLowerCase();
        restaurantsListElement.append(`
            <a href="#${restaurantName}-tab" class="${restaurantItemClass}" id="${restaurantName}-list" data-toggle="list" role="tab">
                <div class="d-flex justify-content-between">
                    <h5 class="mb-1">${restaurant.restaurantName}</h5>
                    <small>${getRestaurantAverageRating(restaurant.ratings)} / 5</small>
                </div>
                <small>${restaurant.address}</small>
            </a>
        `)
        ratingsListElement.append(`
            <div class="tab-pane w-75 m-auto fade show" role="tabpanel" aria-labelledby="${restaurantName}-list" id="${restaurantName}-tab"></div>
        `)
        $(`#${restaurantName}-tab`).append(() => {
            const imgEl = restaurantsImages.find(el => el.name === restaurantName)
            const placeholder = new Image()
            return imgEl ? imgEl.image : placeholder;
        });
        restaurant.ratings.forEach(rating => {
            $(`#${restaurantName}-tab`).append(`
                <div class="w-100 mt-5">
                    <div class="row">
                        <div class="col-4">
                            <h5 style="display: block; text-overflow: ellipsis; white-space: nowrap; overflow: hidden">${rating.stars} / 5</h5>
                        </div>
                        <div class="col">
                            <p class="text-muted">${rating.comment}</p>
                        </div>
                    </div>
                </div>
            `)
        })
        $(`#${restaurantName}-tab`).append(userRatingStringLiteral(restaurantName));
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
        let geocoder= new google.maps.Geocoder;
        let places: google.maps.places.PlacesService

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

        const mapClickLocation = {
            lat: 0,
            lng: 0,
        };

        const listenToMarkerInteraction = (marker: google.maps.Marker, restaurant: Restaurant) => {
            marker.addListener('click', () => {
                $(`#${restaurant.restaurantName}-list`).tab('show')
            });
        }

        const listenToRatingSubmit = (restaurant: Pick<Restaurant, 'restaurantName'>) => {
            const restaurantName = restaurant.restaurantName.slice(0, 10).replace(/ |'|&|,|.|:/g, '-').replace(/à|À/g, 'a').replace(/é|É/g, 'e').replace(/ù/g, 'u').replace(/ê|â|ô|û|î/g, '').toLowerCase();
            $(`#add-rating-button-${restaurantName}`).on('click', () => {
                const stars = Number($(`#rating-form-${restaurantName} input`).val());
                const comment = $(`#rating-form-${restaurantName} textarea`).val() as string;
                const rating = {
                    stars,
                    comment,
                };
                const targetRestaurant = localRestaurantsList.find(_ => _.restaurantName === restaurantName);
                if (stars && comment.length) {
                    localRestaurantsList.map(_ => _ === targetRestaurant ? _.ratings.push(rating) : null);
                    updateRestaurants();
                    alert('Merci pour votre avis !');
                } else {
                    alert("Vous n'avez pas rempli correctement le formulaire");
                }
            })
        }

        const createCustomRestaurant = (geocoder: google.maps.Geocoder) => {
            geocoder.geocode({ location: mapClickLocation },
            (
                results: google.maps.GeocoderResult[],
                status: google.maps.GeocoderStatus
            ) => {
                if (status === 'OK') {
                    if (results[0]) {
                        const address = results[0].formatted_address;
                        const restaurantName = $('#custom-restaurant-form input').val() as string;
                        const customRestaurant: Omit<Restaurant, 'lat' | 'long' | 'address'> = {
                            restaurantName,
                            ratings: [],
                        };
                        localRestaurantsList.push({
                            ...customRestaurant,
                            address,
                            lat: mapClickLocation.lat,
                            long: mapClickLocation.lng,
                        });
                        $('#custom-restaurant-modal').modal('toggle');
                        initRestaurantsImages();
                        updateRestaurants();
                    }
                }
            })
        }

        // Put restaurants on map
        const fillRestaurantsMarkers = (restaurants: Restaurant[]) => {
            restaurantsMarkers.forEach(marker => {
                marker.setMap(null)
            });
            restaurantsMarkers = [];
            restaurants.forEach(restaurant => {
                const marker = new google.maps.Marker({
                    clickable: true,
                    position: {
                        lat: restaurant.lat,
                        lng: restaurant.long,
                    },
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 7,
                        fillOpacity: 1,
                        strokeWeight: 2,
                        fillColor: '#e74c3c',
                        strokeColor: '#FFFFFF',
                    },
                })
                marker.setMap(googleMap);
                restaurantsMarkers.push(marker)
                listenToMarkerInteraction(marker, restaurant)
            });
        };

        const getPlaces = () => {
            const bounds = googleMap.getBounds();
            const center = googleMap.getCenter();
            places = new google.maps.places.PlacesService(googleMap);
            const ne = bounds.getSouthWest();
            const radius = google.maps.geometry.spherical.computeDistanceBetween(center, ne);
            const request: google.maps.places.PlaceSearchRequest = {
                location: center,
                bounds,
                radius,
                type: 'restaurant',
            }

            places.nearbySearch(request, (res) => {
                if (res) {
                    const foundRestaurants = res.map(restaurant => {
                        const formatedRestaurant: Restaurant = {
                            restaurantName: restaurant.name,
                            address: restaurant.formatted_address,
                            lat: restaurant.geometry.location.lat(),
                            long: restaurant.geometry.location.lng(),
                            ratings: restaurant.reviews ? restaurant.reviews.map(review => {
                                return {
                                    stars: review.rating,
                                    comment: review.text,
                                }
                            }) : [],
                        };
                        return formatedRestaurant
                    });
                    localRestaurantsList = foundRestaurants
                    initRestaurantsImages();
                }
            })

            return localRestaurantsList;
        }

        const updateRestaurants = () => {
            const restaurantsList = getPlaces();
            nearestRestaurants = findNearestRestaurants(
                restaurantsList as Restaurant[],
                googleMap,
            );
            resetDOMElements(nearestRestaurants.length === 0);
            fillRestaurantsLists(nearestRestaurants);
            fillRestaurantsMarkers(nearestRestaurants);
            nearestRestaurants.forEach(restaurant => listenToRatingSubmit(restaurant));
        };

        navigator.geolocation.getCurrentPosition((position) => {
            userPosition = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            };
            googleMap = new google.maps.Map(mapElement, {
                center: userPosition,
                ...mapOptions,
            });

            googleMap.addListener('click', (event) => {
                mapClickLocation.lat = event.latLng.lat();
                mapClickLocation.lng = event.latLng.lng();
                $('#custom-restaurant-modal').modal('toggle');
            });

            $('#add-restaurant-button').on('click', () => {
                createCustomRestaurant(geocoder);
            });

            // Listen to bounds changes
            //@ts-ignore
            googleMap.addListener('bounds_changed', (e) => {
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

            updateRestaurants();
        });

        navigator.geolocation.watchPosition((position) => {
            // Put user on the map
            userPosition = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            };
            userPositionDot.setMap(googleMap);
            userPositionDot.setPosition(userPosition);
        }, error, options);
  }
}

// Main initialization
document.head.appendChild(mapScript);