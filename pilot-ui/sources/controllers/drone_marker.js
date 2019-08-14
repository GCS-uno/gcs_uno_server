import Message from "../plugins/Message";

// Параметры маркера на карте
const marker_icon_params = {
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW
    ,scale: 5
    ,strokeColor: '#160e01'
    ,fillColor: '#eede00'
    ,fillOpacity: 1.0
    ,strokeWeight: 3
    ,rotation: 180
};


export default function(drone_instance){

    // Маркер на карте
    const marker = new google.maps.Marker({
        icon: marker_icon_params
        ,zIndex: 100
    });

    // Объект карты
    let map = null;

    // Этот параметр ставится извне
    let autoCenterEnabled = true;
    // Этот параметр используется для временного отключения автоцентра
    let do_autocenter = true;
    let autoCenterTimeout = null;

    // Первичная установка положения маркера
    const setInitPosition = function(){
        centerMap();
        map.setZoom(18);
    };

    // Центр карты
    const centerMap = function(){
        if( marker.getPosition() ) map.panTo(marker.getPosition());
    };

    // Привязка к записи с координатами
    drone_instance.drone_data.telem_1hz.attachEvent('onChange', rec => {
        let lat = parseFloat(rec.lat), lon = parseFloat(rec.lon);

        if( isNaN(lat) || isNaN(lon) ){
            if( drone_instance.view_enabled  ) Message.error('No position data');
            return;
        }

        marker.setPosition({lat: lat, lng: lon});

        // Если карта установлена, а координат не было, то нужно включить маркер и показать его на карте
        if( !marker.getMap() && map && drone_instance.view_enabled ) {
            marker.setMap(map);
            setInitPosition();
        }

        // Если карта установлена и маркер выходит за пределы центра 1/3 экрана, то центрируем карту
        if( do_autocenter && marker.getMap() && map && drone_instance.view_enabled ) {
            let bounds = map.getBounds();
            if( bounds ){
                let top = bounds.getNorthEast().lat(),
                    right = bounds.getNorthEast().lng(),
                    bottom = bounds.getSouthWest().lat(),
                    left = bounds.getSouthWest().lng(),
                    pos_lat = marker.getPosition().lat(),
                    pos_lng = marker.getPosition().lng();

                let vert_one_third = (top-bottom)/4,
                    hor_one_third = (right-left)/4;

                if( pos_lng < left+hor_one_third || pos_lng > right-hor_one_third || pos_lat > top-vert_one_third || pos_lat < bottom+vert_one_third ){
                    centerMap();
                }
            }
        }

    });

    // Привязка к записи с курсом
    drone_instance.drone_data.telem_10hz.attachEvent('onChange', rec => {
        let yaw = parseInt(rec.yaw);
        if( isNaN(yaw) ) yaw = 0;
        marker_icon_params.rotation = yaw;

        marker.setIcon(marker_icon_params);
    });


    return {

        setMap: function(mapObj){
            if( mapObj === null ){
                marker.setMap(null);
                return;
            }

            map = mapObj;

            if( marker.getPosition() && drone_instance.view_enabled ) {
                marker.setMap(map);
                setInitPosition();
            }

            // При перемещении карты временно отключить автоцентр
            map.addListener('dragstart', () => {
                do_autocenter = false;
                if( autoCenterTimeout ){
                    clearTimeout(autoCenterTimeout);
                    autoCenterTimeout = null;
                }
            });
            map.addListener('dragend', () => {
                if( autoCenterEnabled ){
                    autoCenterTimeout = setTimeout( () => {
                        if( autoCenterEnabled ) do_autocenter = true;
                        autoCenterTimeout = null;
                    }, 3000);
                }
            });
            map.addListener('zoom_changed', () => {
                do_autocenter = false;
                if( autoCenterTimeout ){
                    clearTimeout(autoCenterTimeout);
                    autoCenterTimeout = null;
                }
                if( autoCenterEnabled ){
                    autoCenterTimeout = setTimeout( () => {
                        if( autoCenterEnabled ) do_autocenter = true;
                        autoCenterTimeout = null;
                    }, 3000);
                }
            });
        },

        mapAutoCenter: function(enable){
            autoCenterEnabled = !!enable;

            if( autoCenterEnabled ){
                do_autocenter = true;
                centerMap();
            }
            else do_autocenter = false;
        }

    };
};

