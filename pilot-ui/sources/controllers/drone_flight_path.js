import helpers from "../../../utils/helpers";

export default function(drone_instance){
    let active_stroke_color = '#ff1500',
        inactive_stroke_color = '#999999';

    let polyline_options = {
        geodesic: true,
        clickable: false,
        strokeOpacity: 0.8,
        strokeWeight: 4,
        zIndex: 10
    };

    // След
    let f_path = new google.maps.Polyline(polyline_options);
    let last_point_lat = 0, last_point_lon = 0;

    let drone_armed = 0;

    const clear_path = function(){
        f_path.getPath().clear();
        last_point_lat = null;
        last_point_lon = null;
        polyline_options.strokeColor = active_stroke_color;
        f_path.setOptions(polyline_options);
    };

    // привязать добавление точки
    drone_instance.drone_data.telem_1hz.attachEvent("onChange", values => {

        // Очистить след, если дрон активировался
        let armed = parseInt(values.armed);
        if( armed !== drone_armed ){
            if( armed === 1 ) clear_path();
            else {
                polyline_options.strokeColor = inactive_stroke_color;
                f_path.setOptions(polyline_options);
                console.log("INACTIVE COLOR FP");
            }
        }

        drone_armed = armed;

        if( !drone_armed ) return;

        let lat = parseFloat(values.lat), lon = parseFloat(values.lon);
        if( isNaN(lat) || isNaN(lon) ) return;

        // Если линия пустая, то добавляем сразу две точки
        if( !f_path.getPath().getLength() ) {
            f_path.getPath().push(new google.maps.LatLng(lat, lon));
            f_path.getPath().push(new google.maps.LatLng(lat, lon));
            last_point_lat = lat;
            last_point_lon = lon;
        }
        else if( last_point_lat && last_point_lon ) {
            // Добавляем новую точку в след, если разница в сумме координат > X
            let diff = 1;
            if( f_path.getPath().getLength() ) diff = Math.abs((Math.abs(lat)+Math.abs(lon))-(Math.abs(last_point_lat)+Math.abs(last_point_lon)));
            if( diff >= 0.00005 ){
                f_path.getPath().push(new google.maps.LatLng(lat, lon));
                last_point_lat = lat;
                last_point_lon = lon;
            }
            else {
                f_path.getPath().setAt((f_path.getPath().getLength()-1), new google.maps.LatLng(lat, lon));
            }
        }

    });

    return {

        setMap: function(map){
            f_path.setMap(map);
        },

        setPath: function(path){
            if( !path.length ) return;

            const f_pp = f_path.getPath();

            f_pp.clear();
            for( let i = 0, k = path.length; i < k; i++ ) f_pp.push(new google.maps.LatLng(path[i][1], path[i][0]));
            last_point_lat = path[path.length-1][1];
            last_point_lon = path[path.length-1][0];
        }
    }

}
